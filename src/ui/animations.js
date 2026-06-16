import { WINDMILL_TIMINGS } from "../config/windmillTimings.js";
import { wait } from "../utils/time.js";

const GROUP_FLY_STAGGER = 120;
const LIGHTBALL_CHARGE_DURATION = 360;
const LIGHTBALL_LINK_DURATION = 280;
const LIGHTBALL_LINK_STAGGER = 54;
const LIGHTBALL_TARGET_HOLD = 140;
const LIGHTBALL_CLEAR_DURATION = 200;
const DUAL_LIGHTBALL_ORBIT_DURATION = 670;
const DUAL_LIGHTBALL_COLLISION_STOP_DURATION = 90;
const DUAL_LIGHTBALL_COLLISION_DURATION = 140;
const DUAL_LIGHTBALL_FLASH_DURATION = 340;
const DUAL_LIGHTBALL_SHOCKWAVE_DURATION = 420;
const DUAL_LIGHTBALL_POP_DURATION = 180;
const DUAL_LIGHTBALL_WAVE_STAGGER = 14;
const BOMB_PRIME_DURATION = 300;
const BOMB_BLAST_RADIUS_CELLS = 2;
const BOMB_POP_DURATION = 220;
const BOMB_IMPACT_HOLD = 72;
const BOMB_TARGET_STAGGER = 22;
const SPECIAL_CHARGE_PARTICLE_DURATION = 420;
const SPECIAL_CHARGE_PARTICLE_STAGGER = 70;
const MERGED_WINDMILL_TYPE = "mergedWindmill";
const WINDMILL_FUSION_RETREAT_DURATION = 140;
const WINDMILL_FUSION_SLAM_DURATION = 220;
const WINDMILL_FUSION_RETREAT_DISTANCE = 18;

export async function animateWindmillFusion({ primaryTileId, secondaryTileId, tileView, onMerged } = {}) {
  tileView.setWindmillFusionState(primaryTileId, { hideArrow: true, spin: true });
  tileView.setWindmillFusionState(secondaryTileId, { hideArrow: true, spin: false });

  await new Promise((resolve) => {
    tileView.mergeTileIntoTile(secondaryTileId, primaryTileId, {
      retreatDuration: WINDMILL_FUSION_RETREAT_DURATION,
      slamDuration: WINDMILL_FUSION_SLAM_DURATION,
      retreatDistance: WINDMILL_FUSION_RETREAT_DISTANCE,
      onArrive: resolve,
    });
  });

  await Promise.resolve(onMerged?.());

  // updateTile 会重置 class，这里把隐藏箭头和持续旋转重新挂回大风车上。
  tileView.setWindmillFusionState(primaryTileId, { hideArrow: true, spin: true });
}

export async function animateResolution({
  result,
  tileView,
  removeDuration,
  fallDuration,
  flyDuration,
  isGoalTile,
  getSpecialChargeCount,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
}) {
  const removedTileGroups = result.removedTileGroups?.length ? result.removedTileGroups : [result.removedTiles];
  const windmillEffects = [
    ...(result.windmillEffects ?? []),
    ...(result.windmillEffect ? [result.windmillEffect] : []),
  ];
  const hiveEffects = [
    ...(result.hiveEffects ?? []),
    ...(result.hiveEffect ? [result.hiveEffect] : []),
  ];
  const bombEffects = [
    ...(result.bombEffects ?? []),
    ...(result.bombEffect ? [result.bombEffect] : []),
  ];
  const hasSpecialEffects = windmillEffects.length > 0 || hiveEffects.length > 0 || bombEffects.length > 0;
  const windmillTimings = WINDMILL_TIMINGS;
  const goalFlights = [];
  const recycleFlights = [];

  if (hasSpecialEffects) {
    const removedTileById = new Map(result.removedTiles.map((tile) => [tile.id, tile]));
    const specialEffects = [
      ...windmillEffects.map((effect) => ({ ...effect, specialKind: "windmill" })),
      ...bombEffects.map((effect) => ({ ...effect, specialKind: "bomb" })),
      ...hiveEffects.map((effect) => ({ ...effect, specialKind: "hive" })),
    ];
    const specialEffectOriginIds = new Set(specialEffects.map((effect) => effect.originTileId));
    const effectByOriginId = new Map(specialEffects.map((effect) => [effect.originTileId, effect]));
    const effectPromises = new Map();
    const animatedTileIds = new Set();

    const launchSpecialEffect = (effect, ancestorEffectIds = new Set()) => {
      if (!effect) {
        return Promise.resolve();
      }

      // 特效链是真实的图，不是严格的树。
      // 已经启动过的 sibling / cousin 特效由“第一次启动它的分支”负责等待，
      // 后续分支只复用启动结果，不再继续等待，避免出现 A 等 B、B 又等 A 的死锁。
      if (ancestorEffectIds.has(effect.originTileId) || effectPromises.has(effect.originTileId)) {
        return Promise.resolve();
      }

      const nextAncestorEffectIds = new Set(ancestorEffectIds);
      nextAncestorEffectIds.add(effect.originTileId);
      let promise;
      if (effect.specialKind === "windmill") {
        promise = animateWindmillEffect({
          effect,
          removedTileById,
          effectByOriginId,
          launchSpecialEffect,
          ancestorEffectIds: nextAncestorEffectIds,
          animatedTileIds,
          goalFlights,
          recycleFlights,
          tileView,
          windmillTimings,
          flyDuration,
          isGoalTile,
          getSpecialChargeCount,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
        });
      } else if (effect.specialKind === "bomb") {
        promise = animateBombEffect({
          effect,
          removedTileById,
          effectByOriginId,
          launchSpecialEffect,
          ancestorEffectIds: nextAncestorEffectIds,
          animatedTileIds,
          goalFlights,
          recycleFlights,
          tileView,
          flyDuration,
          isGoalTile,
          getSpecialChargeCount,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
        });
      } else {
        promise = animateHiveEffect({
          result,
          hiveEffect: effect,
          effectByOriginId,
          launchSpecialEffect,
          ancestorEffectIds: nextAncestorEffectIds,
          animatedTileIds,
          goalFlights,
          recycleFlights,
          tileView,
          flyDuration,
          isGoalTile,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
        });
      }

      effectPromises.set(effect.originTileId, promise);
      return promise;
    };

    await Promise.all(
      specialEffects
        .filter((effect) => effect.triggeredByTileId == null)
        .map((effect) => launchSpecialEffect(effect)),
    );

    // 双风车合成会吞掉一个已移除的特殊块，它不再作为后续特效 origin，
    // 这里要主动清掉残留 DOM，避免后续下落时画面看起来卡住不更新。
    result.removedTiles
      .filter((tile) => tile.special && !specialEffectOriginIds.has(tile.id))
      .forEach((tile) => {
        tileView.unmountTile(tile.id);
      });

    animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView);
    await wait(fallDuration);

    return {
      goalFlights: Promise.all(goalFlights),
      recycleFlights: Promise.all(recycleFlights),
    };
  }

  removedTileGroups.forEach((group, groupIndex) => {
    const delay = groupIndex * GROUP_FLY_STAGGER;

    for (const tile of group) {
      const shouldFlyToGoal = isGoalTile?.(tile);

      if (!shouldFlyToGoal) {
        recycleFlights.push(new Promise((resolve) => {
          setTimeout(() => {
            tileView.flyTile(tile.id, {
              duration: flyDuration,
              onArrive: resolve,
            });
          }, delay);
        }));
        continue;
      }

      goalFlights.push(new Promise((resolve) => {
        setTimeout(() => {
          tileView.flyTile(tile.id, {
            duration: flyDuration,
            targetRect: getGoalRect?.(tile.kind.key) ?? null,
            onArrive: () => {
              onGoalArrive?.(tile);
              resolve();
            },
          });
        }, delay);
      }));
    }
  });

  await wait(removeDuration + Math.max(0, removedTileGroups.length - 1) * GROUP_FLY_STAGGER);

  // 下落与花朵飞散/飞行并行，不被飞行时长阻塞
  animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView);
  await wait(fallDuration);

  return {
    goalFlights: Promise.all(goalFlights),
    recycleFlights: Promise.all(recycleFlights),
  };
}

async function animateWindmillEffect({
  effect,
  removedTileById,
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  windmillTimings,
  flyDuration,
  isGoalTile,
  getSpecialChargeCount,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
}) {
  const consumedTileIds = effect.mergedSourceTileIds ?? new Set();
  const originRect = tileView.getTileRect(effect.originTileId);
  const windLineDuration = getWindmillCastDuration(windmillTimings);

  tileView.popTile(effect.originTileId, {
    duration: getWindmillTotalDuration(windmillTimings),
    spinUpDuration: windmillTimings.spinUpDuration,
    burstDuration: windLineDuration,
    scaleMultiplier: effect.type === MERGED_WINDMILL_TYPE ? 1.45 : 1,
  });

  await wait(windmillTimings.spinUpDuration);

  const targetHitHandlers = new Map();
  const targetImpactPromises = [];
  const windLineTargetIds = [];
  for (const targetId of effect.targetTileIds ?? []) {
    if (targetId === effect.originTileId) {
      continue;
    }

    if (consumedTileIds.has(targetId)) {
      animatedTileIds.add(targetId);
      continue;
    }

    windLineTargetIds.push(targetId);
    targetImpactPromises.push(new Promise((resolve) => {
      let started = false;
      targetHitHandlers.set(targetId, () => {
        if (started) {
          return;
        }

        started = true;
        Promise.resolve(animateWindmillTargetHit({
          targetId,
          originRect,
          removedTileById,
          effectByOriginId,
          launchSpecialEffect,
          ancestorEffectIds,
          animatedTileIds,
          goalFlights,
          recycleFlights,
          tileView,
          windmillTimings,
          flyDuration,
          isGoalTile,
          getGoalRect,
          onGoalArrive,
        })).finally(resolve);
      });
    }));
  }

  if (windLineTargetIds.length > 0) {
    if (originRect) {
      await tileView.playWindLines({
        fromRect: originRect,
        toTileIds: windLineTargetIds,
        duration: windLineDuration,
        stagger: windmillTimings.windLineStagger,
        windConfig: windmillTimings,
        onTargetHit: (targetId) => {
          targetHitHandlers.get(targetId)?.();
        },
      });
    } else {
      windLineTargetIds.forEach((targetId) => {
        targetHitHandlers.get(targetId)?.();
      });
      await wait(windLineDuration);
    }
  } else {
    await wait(windLineDuration);
  }

  await wait(windmillTimings.fadeDuration);

  queueSpecialChargeParticles({
    tileView,
    originRect,
    chargeCount: getSpecialChargeCount?.(effect.type) ?? 0,
    recycleFlights,
    getRecycleRect,
    onRecycleArrive,
  });

  await Promise.all(targetImpactPromises);
}

async function animateBombEffect({
  effect,
  removedTileById,
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  flyDuration,
  isGoalTile,
  getSpecialChargeCount,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
}) {
  const targetCount = Math.max(0, (effect.targetTileIds?.size ?? 1) - 1);

  await new Promise((resolve) => {
    tileView.primeBombTile(effect.originTileId, {
      duration: BOMB_PRIME_DURATION,
      maxScale: Math.min(1.36, 1.24 + targetCount * 0.005),
      onArrive: resolve,
    });
  });

  const originRect = tileView.getTileRect(effect.originTileId);
  const boardMetrics = tileView.getBoardMetrics();
  const shockwaveMaxRadius = boardMetrics
    ? BOMB_BLAST_RADIUS_CELLS * boardMetrics.span + boardMetrics.tileSize * 0.5
    : null;

  tileView.playBombExplosion(originRect, {
    strength: Math.min(2.1, 1 + targetCount / 18),
    maxRadius: shockwaveMaxRadius,
  });

  tileView.popTile(effect.originTileId, {
    duration: BOMB_POP_DURATION,
    spinUpDuration: 88,
    burstDuration: 96,
    scaleMultiplier: 1.18,
  });

  const childEffectPromises = [];
  for (const targetId of effect.targetTileIds ?? []) {
    if (targetId === effect.originTileId) {
      continue;
    }

    const targetTile = removedTileById.get(targetId);
    if (!targetTile) {
      continue;
    }

    const delay = BOMB_IMPACT_HOLD + Math.max(
      0,
      (Math.abs(targetTile.x - effect.originX) + Math.abs(targetTile.y - effect.originY)) * BOMB_TARGET_STAGGER,
    );
    const childEffect = effectByOriginId.get(targetId);
    if (childEffect) {
      childEffectPromises.push(new Promise((resolve) => {
        setTimeout(() => {
          resolve(launchSpecialEffect(childEffect, ancestorEffectIds));
        }, delay);
      }));
      continue;
    }

    if (animatedTileIds.has(targetTile.id)) {
      continue;
    }

    animatedTileIds.add(targetTile.id);
    if (isGoalTile?.(targetTile)) {
      goalFlights.push(new Promise((resolve) => {
        setTimeout(() => {
          tileView.flyTile(targetTile.id, {
            duration: flyDuration,
            targetRect: getGoalRect?.(targetTile.kind.key) ?? null,
            onArrive: () => {
              onGoalArrive?.(targetTile);
              resolve();
            },
          });
        }, delay);
      }));
      continue;
    }

    recycleFlights.push(new Promise((resolve) => {
      setTimeout(() => {
        tileView.flyTile(targetTile.id, {
          duration: flyDuration,
          onArrive: resolve,
        });
      }, delay);
    }));
  }

  await wait(BOMB_IMPACT_HOLD + BOMB_POP_DURATION + BOMB_TARGET_STAGGER * 4);

  queueSpecialChargeParticles({
    tileView,
    originRect,
    chargeCount: getSpecialChargeCount?.(effect.type) ?? 0,
    recycleFlights,
    getRecycleRect,
    onRecycleArrive,
  });

  await Promise.all(childEffectPromises);
}

async function animateHiveEffect({
  result,
  hiveEffect,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  flyDuration,
  isGoalTile,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
}) {
  if (hiveEffect.mode === "dualBoardBurst") {
    await animateDualHiveEffect({
      result,
      hiveEffect,
      animatedTileIds,
      goalFlights,
      recycleFlights,
      tileView,
      flyDuration,
      isGoalTile,
      getGoalRect,
      onGoalArrive,
    });
    return;
  }

  const targetTileIds = hiveEffect.targetTileIds ?? new Set();
  const targets = result.removedTiles
    .filter((tile) => targetTileIds.has(tile.id))
    .sort((a, b) => {
      const distanceA = Math.abs(a.x - hiveEffect.originX) + Math.abs(a.y - hiveEffect.originY);
      const distanceB = Math.abs(b.x - hiveEffect.originX) + Math.abs(b.y - hiveEffect.originY);
      return distanceA - distanceB || a.y - b.y || a.x - b.x;
    });
  const targetIds = targets.map((tile) => tile.id);

  tileView.setLightballChargeState(hiveEffect.originTileId, true);
  await wait(LIGHTBALL_CHARGE_DURATION);

  await tileView.playLightningLinks({
    fromTileId: hiveEffect.originTileId,
    toTileIds: targetIds,
    duration: LIGHTBALL_LINK_DURATION,
    stagger: LIGHTBALL_LINK_STAGGER,
    onTargetLock: (targetTileId) => {
      tileView.setLightballSelectedState(targetTileId, true);
    },
  });

  await wait(LIGHTBALL_TARGET_HOLD);
  tileView.clearLightballFxState(hiveEffect.originTileId);

  const originClear = new Promise((resolve) => {
    tileView.popTile(hiveEffect.originTileId, {
      duration: LIGHTBALL_CLEAR_DURATION,
      spinUpDuration: 90,
      burstDuration: 54,
      scaleMultiplier: 1.28,
      onArrive: resolve,
    });
  });

  const targetClears = targets.map((tile) => {
    animatedTileIds.add(tile.id);

    return new Promise((resolve) => {
      tileView.clearLightballFxState(tile.id);
      if (isGoalTile?.(tile)) {
        goalFlights.push(new Promise((resolveFlight) => {
          tileView.flyTile(tile.id, {
            duration: flyDuration,
            targetRect: getGoalRect?.(tile.kind.key) ?? null,
            onArrive: () => {
              onGoalArrive?.(tile);
              resolveFlight();
            },
          });
        }));
      } else {
        recycleFlights.push(new Promise((resolveFlight) => {
          tileView.flyTile(tile.id, {
            duration: flyDuration,
            onArrive: resolveFlight,
          });
        }));
      }
      resolve();
    });
  });

  await Promise.all([originClear, ...targetClears]);
}

async function animateDualHiveEffect({
  result,
  hiveEffect,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  flyDuration,
  isGoalTile,
  getGoalRect,
  onGoalArrive,
}) {
  const fusionCenterX = (hiveEffect.originX + hiveEffect.secondaryX) / 2;
  const fusionCenterY = (hiveEffect.originY + hiveEffect.secondaryY) / 2;
  const targetTileIds = hiveEffect.targetTileIds ?? new Set();
  const targets = result.removedTiles
    .filter((tile) => targetTileIds.has(tile.id))
    .sort((a, b) => {
      const distanceA = Math.abs(a.x - fusionCenterX) + Math.abs(a.y - fusionCenterY);
      const distanceB = Math.abs(b.x - fusionCenterX) + Math.abs(b.y - fusionCenterY);
      return distanceA - distanceB || a.y - b.y || a.x - b.x;
    });

  tileView.setLightballFusionState(hiveEffect.originTileId, true);
  tileView.setLightballFusionState(hiveEffect.secondaryTileId, true);
  const fusionFocus = tileView.showLightballFusionFocus();

  await new Promise((resolve) => {
    tileView.orbitTilesIntoFusion(hiveEffect.originTileId, hiveEffect.secondaryTileId, {
      duration: DUAL_LIGHTBALL_ORBIT_DURATION,
      turns: 1.7,
      clockwise: hiveEffect.originX <= hiveEffect.secondaryX,
      endScale: 0.98,
      flareDuration: 220,
      stopDuration: DUAL_LIGHTBALL_COLLISION_STOP_DURATION,
      collisionDuration: DUAL_LIGHTBALL_COLLISION_DURATION,
      onArrive: resolve,
    });
  });

  const fusionRect = tileView.getTileRect(hiveEffect.originTileId);

  tileView.clearLightballFxState(hiveEffect.originTileId);
  tileView.clearLightballFxState(hiveEffect.secondaryTileId);

  await Promise.all([
    fusionFocus.dismiss(),
    new Promise((resolve) => tileView.playBoardShockwave({
      rect: fusionRect,
      duration: DUAL_LIGHTBALL_SHOCKWAVE_DURATION,
      sizeMultiplier: 9.4,
      shakeStrength: 1.6,
      onArrive: resolve,
    })),
    new Promise((resolve) => tileView.playBoardFlash({
      duration: DUAL_LIGHTBALL_FLASH_DURATION,
      maxOpacity: 1,
      onArrive: resolve,
    })),
  ]);

  tileView.unmountTile(hiveEffect.originTileId);

  const flightTargets = targets;

  for (const [index, tile] of flightTargets.entries()) {
    animatedTileIds.add(tile.id);
    const queue = isGoalTile?.(tile) ? goalFlights : recycleFlights;
    queue.push(new Promise((resolve) => {
      setTimeout(() => {
        tileView.flyTile(tile.id, {
          duration: flyDuration,
          targetRect: isGoalTile?.(tile)
            ? getGoalRect?.(tile.kind.key) ?? null
            : null,
          onArrive: () => {
            if (isGoalTile?.(tile)) {
              onGoalArrive?.(tile);
            }
            resolve();
          },
        });
      }, index * DUAL_LIGHTBALL_WAVE_STAGGER);
    }));
  }

  await wait(DUAL_LIGHTBALL_POP_DURATION + Math.max(0, flightTargets.length - 1) * DUAL_LIGHTBALL_WAVE_STAGGER);
}

async function animateWindmillTargetHit({
  targetId,
  originRect,
  removedTileById,
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  windmillTimings,
  flyDuration,
  isGoalTile,
  getGoalRect,
  onGoalArrive,
}) {
  await playWindmillTargetHit(tileView, originRect, targetId, windmillTimings.targetHitPulseDuration);

  const childEffect = effectByOriginId.get(targetId);
  if (childEffect) {
    await launchSpecialEffect(childEffect, ancestorEffectIds);
    return;
  }

  const tile = removedTileById.get(targetId);
  if (!tile || animatedTileIds.has(tile.id)) {
    return;
  }

  animatedTileIds.add(tile.id);

  // 风线命中后再进入既有结算，让玩家先看清楚是谁被吹掉。
  if (isGoalTile?.(tile)) {
    goalFlights.push(new Promise((resolve) => {
      tileView.flyTile(tile.id, {
        duration: flyDuration,
        targetRect: getGoalRect?.(tile.kind.key) ?? null,
        onArrive: () => {
          onGoalArrive?.(tile);
          resolve();
        },
      });
    }));
    return;
  }

  recycleFlights.push(new Promise((resolve) => {
    tileView.flyTile(tile.id, {
      duration: Math.max(flyDuration, windmillTimings.flowerFlyDuration),
      onArrive: resolve,
    });
  }));
}

function playWindmillTargetHit(tileView, originRect, tileId, duration) {
  if (!tileId || duration <= 0) {
    return Promise.resolve();
  }

  const targetRect = tileView.getTileRect(tileId);
  const originCenterX = originRect ? originRect.left + originRect.width / 2 : targetRect?.left ?? 0;
  const originCenterY = originRect ? originRect.top + originRect.height / 2 : targetRect?.top ?? 0;
  const targetCenterX = targetRect ? targetRect.left + targetRect.width / 2 : originCenterX;
  const targetCenterY = targetRect ? targetRect.top + targetRect.height / 2 : originCenterY;

  return new Promise((resolve) => {
    tileView.gustHitTile(tileId, {
      duration,
      directionX: targetCenterX - originCenterX,
      directionY: targetCenterY - originCenterY,
      onArrive: resolve,
    });
  });
}

function getWindmillCastDuration(timings) {
  return timings.windLineDuration ?? timings.burstDuration;
}

function getWindmillTotalDuration(timings) {
  return timings.spinUpDuration + getWindmillCastDuration(timings) + timings.fadeDuration;
}

function queueSpecialChargeParticles({
  tileView,
  originRect,
  chargeCount,
  recycleFlights,
  getRecycleRect,
  onRecycleArrive,
}) {
  if (!originRect || chargeCount <= 0) {
    return;
  }

  for (let index = 0; index < chargeCount; index += 1) {
    recycleFlights.push(new Promise((resolve) => {
      setTimeout(() => {
        tileView.flyLightballParticle({
          fromRect: originRect,
          targetRect: getRecycleRect?.() ?? null,
          duration: SPECIAL_CHARGE_PARTICLE_DURATION,
          onArrive: () => {
            onRecycleArrive?.();
            resolve();
          },
        });
      }, index * SPECIAL_CHARGE_PARTICLE_STAGGER);
    }));
  }
}

export async function animateBoardEntry({ board, tileView, columns, rows, entryGrowDuration, entryTileDelay }) {
  const entries = [];
  const metrics = tileView.getBoardMetrics();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const tile = board[y]?.[x] ?? null;
      if (tile && tileView.getTileElement(tile.id)) {
        entries.push(tile);
      }
    }
  }

  sortByCenterFirst(entries, columns, rows);

  const flights = entries.map((tile, index) => new Promise((resolve) => {
    tileView.growTileIntoBoard(tile.id, {
      duration: entryGrowDuration,
      delay: index * entryTileDelay,
      column: tile.x,
      row: tile.y,
      metrics,
      onArrive: resolve,
    });
  }));

  await Promise.all(flights);
}

function sortByCenterFirst(items, columns, rows) {
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const tieBreakers = new Map(items.map((item) => [item.id, Math.random()]));

  items.sort((a, b) => {
    const distanceA = Math.hypot(a.x - centerX, a.y - centerY);
    const distanceB = Math.hypot(b.x - centerX, b.y - centerY);
    return distanceA - distanceB || tieBreakers.get(a.id) - tieBreakers.get(b.id);
  });
}

function animateDrops(dropped, spawned, createdSpecialTiles, tileView) {
  const metrics = tileView.getBoardMetrics();

  for (const created of createdSpecialTiles) {
    const element = tileView.mountSpawnedTile(created.tile, created.fromRow, metrics);
    tileView.setTileBoardPosition(element, created.tile.x, created.tile.y, metrics);
    requestAnimationFrame(() => {
      element.classList.remove("is-spawning");
    });
  }

  for (const move of dropped) {
    const element = tileView.getTileElement(move.tile.id);
    if (element) {
      tileView.setTileBoardPosition(element, move.tile.x, move.toY, metrics);
    }
  }

  for (const spawn of spawned) {
    const element = tileView.mountSpawnedTile(spawn.tile, spawn.fromRow, metrics);
    tileView.setTileBoardPosition(element, spawn.tile.x, spawn.toRow, metrics);
    requestAnimationFrame(() => {
      element.classList.remove("is-spawning");
    });
  }
}

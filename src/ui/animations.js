import { DUAL_LIGHTBALL_TIMINGS } from "../config/lightballTimings.js";
import { WINDMILL_TIMINGS } from "../config/windmillTimings.js";
import { wait } from "../utils/time.js";

const GROUP_FLY_STAGGER = 120;
const LIGHTBALL_CHARGE_DURATION = 360;
const LIGHTBALL_LINK_DURATION = 280;
const LIGHTBALL_LINK_STAGGER = 54;
const LIGHTBALL_TARGET_HOLD = 140;
const LIGHTBALL_CLEAR_DURATION = 200;
const BOMB_PRIME_DURATION = 300;
const BOMB_BLAST_RADIUS_CELLS = 2;
const BOMB_POP_DURATION = 220;
const BOMB_SHOCKWAVE_DURATION = 260;
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
  onSpecialEffectsComplete,
  onAfterRemoval,
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
  const dualLightballTimings = DUAL_LIGHTBALL_TIMINGS;
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
          dualLightballTimings,
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
    await Promise.resolve(onSpecialEffectsComplete?.());

    // 双风车合成会吞掉一个已移除的特殊块，它不再作为后续特效 origin，
    // 这里要主动清掉残留 DOM，避免后续下落时画面看起来卡住不更新。
    result.removedTiles
      .filter((tile) => tile.special && !specialEffectOriginIds.has(tile.id))
      .forEach((tile) => {
        tileView.unmountTile(tile.id);
      });

    await Promise.resolve(onAfterRemoval?.(result));
    const actualDropDuration = animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView);
    await wait(Math.max(fallDuration, actualDropDuration));

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
  await Promise.resolve(onAfterRemoval?.(result));
  const actualDropDuration = animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView);
  await wait(Math.max(fallDuration, actualDropDuration));

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
    chargeCount: getSpecialChargeCount?.(effect) ?? 0,
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

  const targetReachHandlers = new Map();
  const childEffectPromises = [];
  const targetRects = [];
  for (const targetId of effect.targetTileIds ?? []) {
    if (targetId === effect.originTileId) {
      continue;
    }

    const targetTile = removedTileById.get(targetId);
    if (!targetTile) {
      continue;
    }

    const targetRect = tileView.getTileRect(targetTile.id);
    if (targetRect) {
      targetRects.push({ id: targetTile.id, rect: targetRect });
    }

    const childEffect = effectByOriginId.get(targetId);
    if (childEffect) {
      let started = false;
      childEffectPromises.push(new Promise((resolve) => {
        targetReachHandlers.set(targetId, () => {
          if (started) {
            return;
          }

          started = true;
          Promise.resolve(launchSpecialEffect(childEffect, ancestorEffectIds)).finally(resolve);
        });
      }));
      continue;
    }

    targetReachHandlers.set(targetId, () => {
      if (animatedTileIds.has(targetTile.id)) {
        return;
      }

      animatedTileIds.add(targetTile.id);
      if (isGoalTile?.(targetTile)) {
        goalFlights.push(new Promise((resolve) => {
          tileView.flyTile(targetTile.id, {
            duration: flyDuration,
            targetRect: getGoalRect?.(targetTile.kind.key) ?? null,
            onArrive: () => {
              onGoalArrive?.(targetTile);
              resolve();
            },
          });
        }));
        return;
      }

      recycleFlights.push(new Promise((resolve) => {
        tileView.flyTile(targetTile.id, {
          duration: flyDuration,
          onArrive: resolve,
        });
      }));
    });
  }

  await new Promise((resolve) => tileView.playBoardShockwave({
    rect: originRect,
    duration: BOMB_SHOCKWAVE_DURATION,
    targetRects,
    visible: false,
    onTargetReach: (targetId) => {
      targetReachHandlers.get(targetId)?.();
    },
    onArrive: resolve,
  }));

  for (const targetId of effect.targetTileIds ?? []) {
    if (targetId === effect.originTileId) {
      continue;
    }

    targetReachHandlers.get(targetId)?.();
  }

  await wait(Math.max(BOMB_POP_DURATION, BOMB_SHOCKWAVE_DURATION));

  queueSpecialChargeParticles({
    tileView,
    originRect,
    chargeCount: getSpecialChargeCount?.(effect) ?? 0,
    recycleFlights,
    getRecycleRect,
    onRecycleArrive,
  });

  await Promise.all(childEffectPromises);
}

async function animateHiveEffect({
  result,
  hiveEffect,
  dualLightballTimings,
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
      dualLightballTimings,
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
  dualLightballTimings,
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
  const fusionFocus = tileView.showLightballFusionFocus({
    maxOpacity: dualLightballTimings.focusOpacity,
    fadeInDuration: dualLightballTimings.focusFadeInDuration,
    fadeOutDuration: dualLightballTimings.focusFadeOutDuration,
  });

  await new Promise((resolve) => {
    tileView.orbitTilesIntoFusion(hiveEffect.originTileId, hiveEffect.secondaryTileId, {
      duration: dualLightballTimings.orbitDuration,
      orbitSpeed: dualLightballTimings.orbitSpeed,
      clockwise: hiveEffect.originX <= hiveEffect.secondaryX,
      endScale: dualLightballTimings.orbitEndScale,
      flareDuration: dualLightballTimings.flareDuration,
      stopDuration: dualLightballTimings.stopDuration,
      collisionDuration: dualLightballTimings.collisionDuration,
      stopRadiusScale: dualLightballTimings.stopRadiusScale,
      orbitStretchScale: dualLightballTimings.orbitStretchScale,
      collisionPeakScale: dualLightballTimings.collisionPeakScale,
      collisionEndScale: dualLightballTimings.collisionEndScale,
      collisionFadeStart: dualLightballTimings.collisionFadeStart,
      onArrive: resolve,
    });
  });

  const fusionRect = tileView.getTileRect(hiveEffect.originTileId);
  const flightTargets = targets.filter((tile) => tileView.getTileRect(tile.id));
  const targetReachHandlers = new Map();

  tileView.clearLightballFxState(hiveEffect.originTileId);
  tileView.clearLightballFxState(hiveEffect.secondaryTileId);

  for (const tile of flightTargets) {
    targetReachHandlers.set(tile.id, () => {
      if (animatedTileIds.has(tile.id)) {
        return;
      }

      animatedTileIds.add(tile.id);
      const queue = isGoalTile?.(tile) ? goalFlights : recycleFlights;
      queue.push(new Promise((resolve) => {
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
      }));
    });
  }

  await Promise.all([
    fusionFocus.dismiss(),
    new Promise((resolve) => tileView.playBoardShockwave({
      rect: fusionRect,
      duration: dualLightballTimings.shockwaveDuration,
      sizeMultiplier: dualLightballTimings.shockwaveSizeMultiplier,
      coverViewport: true,
      shakeStrength: dualLightballTimings.shockwaveShakeStrength,
      targetRects: flightTargets.map((tile) => ({ id: tile.id, rect: tileView.getTileRect(tile.id) })),
      onTargetReach: (targetId) => {
        targetReachHandlers.get(targetId)?.();
      },
      onArrive: resolve,
    })),
    new Promise((resolve) => tileView.playBoardFlash({
      duration: dualLightballTimings.flashDuration,
      maxOpacity: 1,
      onArrive: resolve,
    })),
  ]);

  tileView.unmountTile(hiveEffect.originTileId);

  targets
    .filter((tile) => !animatedTileIds.has(tile.id))
    .forEach((tile) => {
      targetReachHandlers.get(tile.id)?.();
    });

  await wait(dualLightballTimings.popDuration);
}

async function animateWindmillTargetHit({
  targetId,
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

  // 风线命中后直接切入已有移除表现，不再额外播放受击抖动。
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
  const getDropDuration = (distance) => Math.max(220, Math.min(720, 180 + distance * 95));
  let maxDropDuration = 0;

  for (const created of createdSpecialTiles) {
    const duration = getDropDuration(Math.abs(created.tile.y - created.fromRow));
    const element = tileView.mountSpawnedTile(created.tile, created.fromRow, metrics);
    tileView.setDropDuration(element, duration);
    maxDropDuration = Math.max(maxDropDuration, duration);
    tileView.setTileBoardPosition(element, created.tile.x, created.tile.y, metrics);
    requestAnimationFrame(() => {
      element.classList.remove("is-spawning");
    });
  }

  for (const move of dropped) {
    const element = tileView.getTileElement(move.tile.id);
    if (element) {
      const distance = Math.max(Math.abs((move.toX ?? move.tile.x) - (move.fromX ?? move.tile.x)), Math.abs(move.toY - move.fromY));
      const duration = getDropDuration(distance);
      tileView.setDropDuration(element, duration);
      maxDropDuration = Math.max(maxDropDuration, duration);
      tileView.setTileBoardPosition(element, move.tile.x, move.toY, metrics);
    }
  }

  for (const spawn of spawned) {
    const duration = getDropDuration(Math.abs(spawn.toRow - spawn.fromRow));
    const element = tileView.mountSpawnedTile(spawn.tile, spawn.fromRow, metrics);
    tileView.setDropDuration(element, duration);
    maxDropDuration = Math.max(maxDropDuration, duration);
    tileView.setTileBoardPosition(element, spawn.tile.x, spawn.toRow, metrics);
    requestAnimationFrame(() => {
      element.classList.remove("is-spawning");
    });
  }

  return maxDropDuration;
}

import { WINDMILL_TIMINGS } from "../config/windmillTimings.js";
import { wait } from "../utils/time.js";

const GROUP_FLY_STAGGER = 120;
const LIGHTBALL_CHARGE_DURATION = 360;
const LIGHTBALL_LINK_DURATION = 280;
const LIGHTBALL_LINK_STAGGER = 54;
const LIGHTBALL_TARGET_HOLD = 140;
const LIGHTBALL_CLEAR_DURATION = 200;
const DUAL_LIGHTBALL_CHARGE_DURATION = 150;
const DUAL_LIGHTBALL_ORBIT_DURATION = 340;
const DUAL_LIGHTBALL_FLASH_DURATION = 260;
const DUAL_LIGHTBALL_SHOCKWAVE_DURATION = 320;
const DUAL_LIGHTBALL_POP_DURATION = 180;
const DUAL_LIGHTBALL_WAVE_STAGGER = 14;
const BOMB_POP_DURATION = 220;
const BOMB_TARGET_STAGGER = 34;
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
  speedMultiplier = 1,
  isGoalTile,
  getSpecialChargeCount,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
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
  const windmillTimings = scaleWindmillTimings(WINDMILL_TIMINGS, speedMultiplier);
  const lightballTimings = {
    chargeDuration: scaleDuration(LIGHTBALL_CHARGE_DURATION, speedMultiplier),
    linkDuration: scaleDuration(LIGHTBALL_LINK_DURATION, speedMultiplier),
    linkStagger: scaleDuration(LIGHTBALL_LINK_STAGGER, speedMultiplier),
    targetHold: scaleDuration(LIGHTBALL_TARGET_HOLD, speedMultiplier),
    clearDuration: scaleDuration(LIGHTBALL_CLEAR_DURATION, speedMultiplier),
  };
  const dualLightballTimings = {
    chargeDuration: scaleDuration(DUAL_LIGHTBALL_CHARGE_DURATION, speedMultiplier),
    orbitDuration: scaleDuration(DUAL_LIGHTBALL_ORBIT_DURATION, speedMultiplier),
    flashDuration: scaleDuration(DUAL_LIGHTBALL_FLASH_DURATION, speedMultiplier),
    shockwaveDuration: scaleDuration(DUAL_LIGHTBALL_SHOCKWAVE_DURATION, speedMultiplier),
    popDuration: scaleDuration(DUAL_LIGHTBALL_POP_DURATION, speedMultiplier),
    waveStagger: scaleDuration(DUAL_LIGHTBALL_WAVE_STAGGER, speedMultiplier),
  };
  const bombTimings = {
    popDuration: scaleDuration(BOMB_POP_DURATION, speedMultiplier),
    targetStagger: scaleDuration(BOMB_TARGET_STAGGER, speedMultiplier),
  };
  const specialChargeTimings = {
    particleDuration: scaleDuration(SPECIAL_CHARGE_PARTICLE_DURATION, speedMultiplier),
    particleStagger: scaleDuration(SPECIAL_CHARGE_PARTICLE_STAGGER, speedMultiplier),
  };
  const scaledRemoveDuration = scaleDuration(removeDuration, speedMultiplier);
  const scaledFallDuration = scaleDuration(fallDuration, speedMultiplier);
  const scaledFlyDuration = scaleDuration(flyDuration, speedMultiplier);
  const groupFlyStagger = scaleDuration(GROUP_FLY_STAGGER, speedMultiplier);
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
          flyDuration: scaledFlyDuration,
          isGoalTile,
          getSpecialChargeCount,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
          specialChargeTimings,
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
          flyDuration: scaledFlyDuration,
          isGoalTile,
          getSpecialChargeCount,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
          bombTimings,
          specialChargeTimings,
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
          flyDuration: scaledFlyDuration,
          isGoalTile,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
          lightballTimings,
          dualLightballTimings,
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

    await Promise.resolve(onAfterRemoval?.(result));
    const dropDuration = animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView, {
      speedMultiplier,
    });
    await wait(Math.max(scaledFallDuration, dropDuration));

    return {
      goalFlights: Promise.all(goalFlights),
      recycleFlights: Promise.all(recycleFlights),
    };
  }

  removedTileGroups.forEach((group, groupIndex) => {
    const delay = groupIndex * groupFlyStagger;

    for (const tile of group) {
      const shouldFlyToGoal = isGoalTile?.(tile);

      if (!shouldFlyToGoal) {
        recycleFlights.push(new Promise((resolve) => {
          setTimeout(() => {
            tileView.flyTile(tile.id, {
              duration: scaledFlyDuration,
              onArrive: resolve,
            });
          }, delay);
        }));
        continue;
      }

      goalFlights.push(new Promise((resolve) => {
        setTimeout(() => {
          tileView.flyTile(tile.id, {
            duration: scaledFlyDuration,
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

  await wait(scaledRemoveDuration + Math.max(0, removedTileGroups.length - 1) * groupFlyStagger);

  // 下落与花朵飞散/飞行并行，不被飞行时长阻塞
  await Promise.resolve(onAfterRemoval?.(result));
  const dropDuration = animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView, {
    speedMultiplier,
  });
  await wait(Math.max(scaledFallDuration, dropDuration));

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
  specialChargeTimings,
}) {
  const consumedTileIds = effect.mergedSourceTileIds ?? new Set();
  const originRect = tileView.getTileRect(effect.originTileId);

  tileView.popTile(effect.originTileId, {
    duration: getWindmillTotalDuration(windmillTimings),
    spinUpDuration: windmillTimings.spinUpDuration,
    burstDuration: windmillTimings.burstDuration,
    scaleMultiplier: effect.type === MERGED_WINDMILL_TYPE ? 1.45 : 1,
  });

  await wait(windmillTimings.spinUpDuration);

  const childEffectPromises = [];
  for (const targetId of effect.targetTileIds ?? []) {
    if (targetId === effect.originTileId) {
      continue;
    }

    if (consumedTileIds.has(targetId)) {
      animatedTileIds.add(targetId);
      continue;
    }

    const childEffect = effectByOriginId.get(targetId);
    if (childEffect) {
      childEffectPromises.push(launchSpecialEffect(childEffect, ancestorEffectIds));
      continue;
    }

    const tile = removedTileById.get(targetId);
    if (!tile || animatedTileIds.has(tile.id)) {
      continue;
    }

    animatedTileIds.add(tile.id);

    // 目标花：飞向 HUD 目标槽位（与光球结算一致），而不是被吹散到屏幕外。
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
      continue;
    }

    recycleFlights.push(new Promise((resolve) => {
      tileView.flyTile(tile.id, {
        duration: Math.max(flyDuration, windmillTimings.flowerFlyDuration),
        onArrive: resolve,
      });
    }));
  }

  await wait(windmillTimings.burstDuration + windmillTimings.fadeDuration);

  queueSpecialChargeParticles({
    tileView,
    originRect,
    chargeCount: getSpecialChargeCount?.(effect.type) ?? 0,
    recycleFlights,
    getRecycleRect,
    onRecycleArrive,
    specialChargeTimings,
  });

  await Promise.all(childEffectPromises);
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
  bombTimings,
  specialChargeTimings,
}) {
  const originRect = tileView.getTileRect(effect.originTileId);

  tileView.popTile(effect.originTileId, {
    duration: bombTimings.popDuration,
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

    const delay = Math.max(
      0,
      (Math.abs(targetTile.x - effect.originX) + Math.abs(targetTile.y - effect.originY)) * bombTimings.targetStagger,
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

  await wait(bombTimings.popDuration + bombTimings.targetStagger * 4);

  queueSpecialChargeParticles({
    tileView,
    originRect,
    chargeCount: getSpecialChargeCount?.(effect.type) ?? 0,
    recycleFlights,
    getRecycleRect,
    onRecycleArrive,
    specialChargeTimings,
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
  lightballTimings,
  dualLightballTimings,
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
      dualLightballTimings,
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
  await wait(lightballTimings.chargeDuration);

  await tileView.playLightningLinks({
    fromTileId: hiveEffect.originTileId,
    toTileIds: targetIds,
    duration: lightballTimings.linkDuration,
    stagger: lightballTimings.linkStagger,
    onTargetLock: (targetTileId) => {
      tileView.setLightballSelectedState(targetTileId, true);
    },
  });

  await wait(lightballTimings.targetHold);
  tileView.clearLightballFxState(hiveEffect.originTileId);

  const originClear = new Promise((resolve) => {
    tileView.popTile(hiveEffect.originTileId, {
      duration: lightballTimings.clearDuration,
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
  dualLightballTimings,
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

  tileView.setLightballChargeState(hiveEffect.originTileId, true);
  tileView.setLightballChargeState(hiveEffect.secondaryTileId, true);

  await Promise.all([
    new Promise((resolve) => tileView.pulseTile(hiveEffect.originTileId, {
      duration: dualLightballTimings.chargeDuration,
      scaleMultiplier: 1.16,
      onArrive: resolve,
    })),
    new Promise((resolve) => tileView.pulseTile(hiveEffect.secondaryTileId, {
      duration: dualLightballTimings.chargeDuration,
      scaleMultiplier: 1.16,
      onArrive: resolve,
    })),
  ]);

  await new Promise((resolve) => {
    tileView.orbitTilesIntoFusion(hiveEffect.originTileId, hiveEffect.secondaryTileId, {
      duration: dualLightballTimings.orbitDuration,
      turns: 0.96,
      clockwise: hiveEffect.originX <= hiveEffect.secondaryX,
      endScale: 0.9,
      flareDuration: 170,
      onArrive: resolve,
    });
  });

  const fusionRect = tileView.getTileRect(hiveEffect.originTileId);

  tileView.clearLightballFxState(hiveEffect.originTileId);
  tileView.clearLightballFxState(hiveEffect.secondaryTileId);

  await Promise.all([
    new Promise((resolve) => tileView.playBoardShockwave({
      rect: fusionRect,
      duration: dualLightballTimings.shockwaveDuration,
      onArrive: resolve,
    })),
    new Promise((resolve) => tileView.playBoardFlash({
      duration: dualLightballTimings.flashDuration,
      onArrive: resolve,
    })),
  ]);

  const flightTargets = [
    result.removedTiles.find((tile) => tile.id === hiveEffect.originTileId),
    ...targets,
  ].filter(Boolean);

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
      }, index * dualLightballTimings.waveStagger);
    }));
  }

  await wait(dualLightballTimings.popDuration + Math.max(0, flightTargets.length - 1) * dualLightballTimings.waveStagger);
}

function scaleWindmillTimings(timings, speedMultiplier) {
  return {
    spinUpDuration: scaleDuration(timings.spinUpDuration, speedMultiplier),
    burstDuration: scaleDuration(timings.burstDuration, speedMultiplier),
    flowerFlyDuration: scaleDuration(timings.flowerFlyDuration, speedMultiplier),
    fadeDuration: scaleDuration(timings.fadeDuration, speedMultiplier),
  };
}

function scaleDuration(duration, speedMultiplier) {
  const normalizedSpeed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  return Math.max(0, Math.round(duration / normalizedSpeed));
}

function getWindmillTotalDuration(timings) {
  return timings.spinUpDuration + timings.burstDuration + timings.fadeDuration;
}

function queueSpecialChargeParticles({
  tileView,
  originRect,
  chargeCount,
  recycleFlights,
  getRecycleRect,
  onRecycleArrive,
  specialChargeTimings,
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
          duration: specialChargeTimings.particleDuration,
          onArrive: () => {
            onRecycleArrive?.();
            resolve();
          },
        });
      }, index * specialChargeTimings.particleStagger);
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

function animateDrops(dropped, spawned, createdSpecialTiles, tileView, { speedMultiplier = 1 } = {}) {
  const metrics = tileView.getBoardMetrics();
  const queueStepDuration = scaleDuration(88, speedMultiplier);
  const getDropDuration = (distance) => scaleDuration(
    Math.max(220, Math.min(720, 180 + distance * 95)),
    speedMultiplier,
  );
  let longestDropDuration = 0;

  const updateLongestDropDuration = (duration) => {
    longestDropDuration = Math.max(longestDropDuration, duration);
  };

  for (const created of createdSpecialTiles) {
    const element = tileView.mountSpawnedTile(created.tile, created.fromRow, metrics);
    const dropDuration = getDropDuration(Math.abs(created.tile.y - created.fromRow));
    tileView.setDropDuration(element, dropDuration);
    tileView.animateDropPath(element, [{ x: created.tile.x, y: created.tile.y, step: 1 }], {
      duration: dropDuration,
      metrics,
    });
    updateLongestDropDuration(dropDuration);
  }

  for (const move of dropped) {
    const element = tileView.getTileElement(move.tile.id);
    if (element) {
      const distance = Math.max(Math.abs((move.toX ?? move.tile.x) - (move.fromX ?? move.tile.x)), Math.abs(move.toY - move.fromY));
      const timelineDuration = getDropTimelineDuration(move.path, queueStepDuration);
      const dropDuration = Math.max(getDropDuration(distance), timelineDuration);
      tileView.setDropDuration(element, dropDuration);
      tileView.animateDropPath(element, move.path ?? [{ x: move.tile.x, y: move.toY }], {
        duration: dropDuration,
        metrics,
      });
      updateLongestDropDuration(dropDuration);
    }
  }

  for (const spawn of spawned) {
    const element = tileView.mountSpawnedTile(spawn.tile, spawn.fromRow, metrics);
    const timelineDuration = getDropTimelineDuration(spawn.path, queueStepDuration);
    const dropDuration = Math.max(getDropDuration(Math.abs(spawn.toRow - spawn.fromRow)), timelineDuration);
    tileView.setDropDuration(element, dropDuration);
    tileView.animateDropPath(element, spawn.path ?? [{ x: spawn.toX ?? spawn.tile.x, y: spawn.toRow }], {
      duration: dropDuration,
      metrics,
    });
    updateLongestDropDuration(dropDuration);
  }

  return longestDropDuration;
}

function getDropTimelineDuration(path = [], queueStepDuration) {
  const lastStep = path.reduce((maxStep, point, index) => Math.max(maxStep, point.step ?? index + 1), 0);
  return Math.max(queueStepDuration, lastStep * queueStepDuration);
}

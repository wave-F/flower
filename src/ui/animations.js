import { DUAL_LIGHTBALL_TIMINGS } from "../config/lightballTimings.js";
import { WINDMILL_TIMINGS } from "../config/windmillTimings.js";
import { wait } from "../utils/time.js";

const GROUP_FLY_STAGGER = 120;
const LIGHTBALL_CHARGE_DURATION = 360;
const LIGHTBALL_LINK_DURATION = 280;
const LIGHTBALL_LINK_STAGGER = 54;
const LIGHTBALL_TARGET_HOLD = 140;
const LIGHTBALL_CLEAR_DURATION = 200;
const DUAL_LIGHTBALL_CHARGE_DURATION = 150;
const BOMB_PRIME_DURATION = 300;
const BOMB_BLAST_RADIUS_CELLS = 2;
const BOMB_POP_DURATION = 220;
const BOMB_SHOCKWAVE_DURATION = 260;
const MERGED_WINDMILL_TYPE = "mergedWindmill";
const WINDMILL_FUSION_RETREAT_DURATION = 140;
const WINDMILL_FUSION_SLAM_DURATION = 220;
const WINDMILL_FUSION_RETREAT_DISTANCE = 18;
const WINDMILL_HIT_AUDIO_ASSET_PATH = "./assets/audio/windmill.mp3";
const BOMB_AUDIO_ASSET_PATH = "./assets/audio/bomb.mp3";
const LIGHT_AUDIO_ASSET_PATH = "./assets/audio/light.mp3";
const windmillHitSound = createSoundEffect(WINDMILL_HIT_AUDIO_ASSET_PATH);
const bombSound = createSoundEffect(BOMB_AUDIO_ASSET_PATH);
const lightSound = createSoundEffect(LIGHT_AUDIO_ASSET_PATH);

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
  shouldChargeTile,
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
  const windmillTimings = scaleWindmillTimings(WINDMILL_TIMINGS, speedMultiplier);
  const lightballTimings = {
    chargeDuration: scaleDuration(LIGHTBALL_CHARGE_DURATION, speedMultiplier),
    linkDuration: scaleDuration(LIGHTBALL_LINK_DURATION, speedMultiplier),
    linkStagger: scaleDuration(LIGHTBALL_LINK_STAGGER, speedMultiplier),
    targetHold: scaleDuration(LIGHTBALL_TARGET_HOLD, speedMultiplier),
    clearDuration: scaleDuration(LIGHTBALL_CLEAR_DURATION, speedMultiplier),
  };
  const dualLightballTimings = scaleDualLightballTimings(DUAL_LIGHTBALL_TIMINGS, speedMultiplier);
  const bombTimings = {
    primeDuration: scaleDuration(BOMB_PRIME_DURATION, speedMultiplier),
    popDuration: scaleDuration(BOMB_POP_DURATION, speedMultiplier),
    shockwaveDuration: scaleDuration(BOMB_SHOCKWAVE_DURATION, speedMultiplier),
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
          shouldChargeTile,
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
          flyDuration: scaledFlyDuration,
          isGoalTile,
          shouldChargeTile,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
          bombTimings,
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
          shouldChargeTile,
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
    await Promise.resolve(onSpecialEffectsComplete?.());

    // 双风车合成会吞掉一个已移除的特殊块，它不再作为后续特效 origin，
    // 这里要主动清掉残留 DOM，避免后续下落时画面看起来卡住不更新。
    result.removedTiles
      .filter((tile) => tile.special && !specialEffectOriginIds.has(tile.id))
      .forEach((tile) => {
        tileView.unmountTile(tile.id);
      });

    await Promise.resolve(onAfterRemoval?.(result));
    const dropResult = animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView, {
      speedMultiplier,
    });
    await Promise.all([
      wait(Math.max(scaledFallDuration, dropResult.duration)),
      dropResult.finished,
    ]);

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
            const shouldFlyToRecycle = shouldChargeTile?.(tile) ?? false;
            tileView.flyTile(tile.id, {
              duration: scaledFlyDuration,
              targetRect: shouldFlyToRecycle ? (getRecycleRect?.() ?? null) : null,
              onArrive: () => {
                if (shouldFlyToRecycle) {
                  onRecycleArrive?.();
                }
                resolve();
              },
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
  const dropResult = animateDrops(result.dropped, result.spawned, result.createdSpecialTiles ?? [], tileView, {
    speedMultiplier,
  });
  await Promise.all([
    wait(Math.max(scaledFallDuration, dropResult.duration)),
    dropResult.finished,
  ]);

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
  shouldChargeTile,
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
          shouldChargeTile,
          getGoalRect,
          getRecycleRect,
          onGoalArrive,
          onRecycleArrive,
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
  shouldChargeTile,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
  bombTimings,
}) {
  const targetCount = Math.max(0, (effect.targetTileIds?.size ?? 1) - 1);

  await new Promise((resolve) => {
    tileView.primeBombTile(effect.originTileId, {
      duration: bombTimings.primeDuration,
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
  bombSound.play();

  tileView.popTile(effect.originTileId, {
    duration: bombTimings.popDuration,
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
        const shouldFlyToRecycle = shouldChargeTile?.(targetTile) ?? false;
        tileView.flyTile(targetTile.id, {
          duration: flyDuration,
          targetRect: shouldFlyToRecycle ? (getRecycleRect?.() ?? null) : null,
          onArrive: () => {
            if (shouldFlyToRecycle) {
              onRecycleArrive?.();
            }
            resolve();
          },
        });
      }));
    });
  }

  await new Promise((resolve) => tileView.playBoardShockwave({
    rect: originRect,
    duration: bombTimings.shockwaveDuration,
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

  await wait(Math.max(bombTimings.popDuration, bombTimings.shockwaveDuration));
  await Promise.all(childEffectPromises);
}

async function animateHiveEffect({
  result,
  hiveEffect,
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  flyDuration,
  isGoalTile,
  shouldChargeTile,
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
      effectByOriginId,
      launchSpecialEffect,
      ancestorEffectIds,
      animatedTileIds,
      goalFlights,
      recycleFlights,
      tileView,
      flyDuration,
      isGoalTile,
      shouldChargeTile,
      getGoalRect,
      getRecycleRect,
      onGoalArrive,
      onRecycleArrive,
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
      lightSound.play();
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
          const shouldFlyToRecycle = shouldChargeTile?.(tile) ?? false;
          tileView.flyTile(tile.id, {
            duration: flyDuration,
            targetRect: shouldFlyToRecycle ? (getRecycleRect?.() ?? null) : null,
            onArrive: () => {
              if (shouldFlyToRecycle) {
                onRecycleArrive?.();
              }
              resolveFlight();
            },
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
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  goalFlights,
  recycleFlights,
  tileView,
  flyDuration,
  isGoalTile,
  shouldChargeTile,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
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

  tileView.setLightballFusionState(hiveEffect.originTileId, true);
  tileView.setLightballFusionState(hiveEffect.secondaryTileId, true);
  const fusionFocus = tileView.showLightballFusionFocus({
    maxOpacity: dualLightballTimings.focusOpacity,
    fadeInDuration: dualLightballTimings.focusFadeInDuration,
    fadeOutDuration: dualLightballTimings.focusFadeOutDuration,
  });

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
  const targetRects = flightTargets
    .map((tile) => {
      const rect = tileView.getTileRect(tile.id);
      return rect ? { id: tile.id, rect } : null;
    })
    .filter(Boolean);
  const targetReachHandlers = new Map();
  const childEffectPromises = [];

  tileView.clearLightballFxState(hiveEffect.originTileId);
  tileView.clearLightballFxState(hiveEffect.secondaryTileId);

  for (const tile of flightTargets) {
    const childEffect = effectByOriginId?.get(tile.id);
    if (childEffect) {
      let started = false;
      childEffectPromises.push(new Promise((resolve) => {
        targetReachHandlers.set(tile.id, () => {
          if (started) {
            return;
          }

          started = true;
          Promise.resolve(launchSpecialEffect?.(childEffect, ancestorEffectIds)).finally(resolve);
        });
      }));
      continue;
    }

    targetReachHandlers.set(tile.id, () => {
      if (animatedTileIds.has(tile.id)) {
        return;
      }

      animatedTileIds.add(tile.id);
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
        const shouldFlyToRecycle = shouldChargeTile?.(tile) ?? false;
        tileView.flyTile(tile.id, {
          duration: flyDuration,
          targetRect: shouldFlyToRecycle ? (getRecycleRect?.() ?? null) : null,
          onArrive: () => {
            if (shouldFlyToRecycle) {
              onRecycleArrive?.();
            }
            resolve();
          },
        });
      }));
    });
  }

  bombSound.play();
  await Promise.all([
    fusionFocus.dismiss(),
    new Promise((resolve) => tileView.playBoardShockwave({
      rect: fusionRect,
      duration: dualLightballTimings.shockwaveDuration,
      sizeMultiplier: dualLightballTimings.shockwaveSizeMultiplier,
      coverViewport: true,
      shakeStrength: dualLightballTimings.shockwaveShakeStrength,
      targetRects,
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
  await Promise.all(childEffectPromises);
}

function scaleWindmillTimings(timings, speedMultiplier) {
  const windLineDuration = scaleDuration(timings.windLineDuration ?? timings.burstDuration, speedMultiplier);
  return {
    ...timings,
    spinUpDuration: scaleDuration(timings.spinUpDuration, speedMultiplier),
    burstDuration: windLineDuration,
    windLineDuration,
    windLineStagger: scaleDuration(timings.windLineStagger, speedMultiplier),
    flowerFlyDuration: scaleDuration(timings.flowerFlyDuration, speedMultiplier),
    targetHitPulseDuration: scaleDuration(timings.targetHitPulseDuration, speedMultiplier),
    fadeDuration: scaleDuration(timings.fadeDuration, speedMultiplier),
  };
}

function scaleDualLightballTimings(timings, speedMultiplier) {
  return {
    ...timings,
    chargeDuration: scaleDuration(DUAL_LIGHTBALL_CHARGE_DURATION, speedMultiplier),
    orbitDuration: scaleDuration(timings.orbitDuration, speedMultiplier),
    stopDuration: scaleDuration(timings.stopDuration, speedMultiplier),
    collisionDuration: scaleDuration(timings.collisionDuration, speedMultiplier),
    focusFadeInDuration: scaleDuration(timings.focusFadeInDuration, speedMultiplier),
    focusFadeOutDuration: scaleDuration(timings.focusFadeOutDuration, speedMultiplier),
    flareDuration: scaleDuration(timings.flareDuration, speedMultiplier),
    flashDuration: scaleDuration(timings.flashDuration, speedMultiplier),
    shockwaveDuration: scaleDuration(timings.shockwaveDuration, speedMultiplier),
    popDuration: scaleDuration(timings.popDuration, speedMultiplier),
    waveStagger: scaleDuration(timings.waveStagger, speedMultiplier),
  };
}

function scaleDuration(duration, speedMultiplier) {
  const normalizedSpeed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  return Math.max(0, Math.round(duration / normalizedSpeed));
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
  shouldChargeTile,
  getGoalRect,
  getRecycleRect,
  onGoalArrive,
  onRecycleArrive,
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
  windmillHitSound.play();

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
    const shouldFlyToRecycle = shouldChargeTile?.(tile) ?? false;
    tileView.flyTile(tile.id, {
      duration: Math.max(flyDuration, windmillTimings.flowerFlyDuration),
      targetRect: shouldFlyToRecycle ? (getRecycleRect?.() ?? null) : null,
      onArrive: () => {
        if (shouldFlyToRecycle) {
          onRecycleArrive?.();
        }
        resolve();
      },
    });
  }));
}

function getWindmillCastDuration(timings) {
  return timings.windLineDuration ?? timings.burstDuration;
}

function createSoundEffect(src) {
  if (typeof Audio !== "function") {
    return {
      play() {},
    };
  }

  const template = new Audio(src);
  template.preload = "auto";
  template.load();

  return {
    play() {
      const playback = template.cloneNode();
      playback.currentTime = 0;
      void playback.play().catch(() => {
        // 浏览器若暂时拒绝播放，不影响动画主流程。
      });
    },
  };
}

function getWindmillTotalDuration(timings) {
  return timings.spinUpDuration + getWindmillCastDuration(timings) + timings.fadeDuration;
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
  const dropAnimations = [];

  const updateLongestDropDuration = (duration) => {
    longestDropDuration = Math.max(longestDropDuration, duration);
  };

  for (const created of createdSpecialTiles) {
    const element = tileView.mountSpawnedTile(created.tile, created.fromRow, metrics);
    const dropDuration = getDropDuration(Math.abs(created.tile.y - created.fromRow));
    tileView.setDropDuration(element, dropDuration);
    dropAnimations.push(tileView.animateDropPath(element, [{ x: created.tile.x, y: created.tile.y, step: 1 }], {
      duration: dropDuration,
      metrics,
    }));
    updateLongestDropDuration(dropDuration);
  }

  for (const move of dropped) {
    const element = tileView.getTileElement(move.tile.id);
    if (element) {
      const distance = Math.max(
        Math.abs((move.toX ?? move.tile.x) - (move.fromX ?? move.tile.x)),
        Math.abs(move.toY - move.fromY),
      );
      const timelineDuration = getDropTimelineDuration(move.path, queueStepDuration);
      const dropDuration = Math.max(getDropDuration(distance), timelineDuration);
      tileView.setDropDuration(element, dropDuration);
      dropAnimations.push(tileView.animateDropPath(element, move.path ?? [{ x: move.toX ?? move.tile.x, y: move.toY }], {
        duration: dropDuration,
        metrics,
      }));
      updateLongestDropDuration(dropDuration);
    }
  }

  for (const spawn of spawned) {
    const element = tileView.mountSpawnedTile(spawn.tile, spawn.fromRow, metrics);
    const timelineDuration = getDropTimelineDuration(spawn.path, queueStepDuration);
    const dropDuration = Math.max(getDropDuration(Math.abs(spawn.toRow - spawn.fromRow)), timelineDuration);
    tileView.setDropDuration(element, dropDuration);
    dropAnimations.push(tileView.animateDropPath(element, spawn.path ?? [{ x: spawn.toX ?? spawn.tile.x, y: spawn.toRow }], {
      duration: dropDuration,
      metrics,
    }));
    updateLongestDropDuration(dropDuration);
  }

  return {
    duration: longestDropDuration,
    finished: Promise.all(dropAnimations),
  };
}

function getDropTimelineDuration(path = [], queueStepDuration) {
  const lastStep = path.reduce((maxStep, point, index) => Math.max(maxStep, point.step ?? index + 1), 0);
  return Math.max(queueStepDuration, lastStep * queueStepDuration);
}

import { WINDMILL_TIMINGS } from "../config/windmillTimings.js";
import { wait } from "../utils/time.js";

const GROUP_FLY_STAGGER = 120;
const HIVE_OPEN_DURATION = 420;
const HIVE_BEE_DURATION = 860;
const HIVE_BEE_STAGGER = 85;
const HIVE_FLOWER_DELAY = 90;
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
  isGoalKind,
  getGoalRect,
  onGoalArrive,
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
  const hasSpecialEffects = windmillEffects.length > 0 || hiveEffects.length > 0;
  const windmillTimings = WINDMILL_TIMINGS;
  const flights = [];

  if (hasSpecialEffects) {
    const removedTileById = new Map(result.removedTiles.map((tile) => [tile.id, tile]));
    const specialEffects = [
      ...windmillEffects.map((effect) => ({ ...effect, specialKind: "windmill" })),
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
      const promise = effect.specialKind === "windmill"
        ? animateWindmillEffect({
          effect,
          removedTileById,
          effectByOriginId,
          launchSpecialEffect,
          ancestorEffectIds: nextAncestorEffectIds,
          animatedTileIds,
          flights,
          tileView,
          windmillTimings,
          flyDuration,
          isGoalKind,
          getGoalRect,
          onGoalArrive,
        })
        : animateHiveEffect({
          result,
          hiveEffect: effect,
          effectByOriginId,
          launchSpecialEffect,
          ancestorEffectIds: nextAncestorEffectIds,
          animatedTileIds,
          flights,
          tileView,
          flyDuration,
          isGoalKind,
          getGoalRect,
          onGoalArrive,
        });

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
      goalFlights: Promise.all(flights),
    };
  }

  removedTileGroups.forEach((group, groupIndex) => {
    const delay = groupIndex * GROUP_FLY_STAGGER;

    for (const tile of group) {
      const isGoalTile = isGoalKind?.(tile.kind.key);

      if (!isGoalTile) {
        setTimeout(() => {
          tileView.flyTile(tile.id, { duration: flyDuration });
        }, delay);
        continue;
      }

      flights.push(new Promise((resolve) => {
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
    goalFlights: Promise.all(flights),
  };
}

async function animateWindmillEffect({
  effect,
  removedTileById,
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  flights,
  tileView,
  windmillTimings,
  flyDuration,
  isGoalKind,
  getGoalRect,
  onGoalArrive,
}) {
  const consumedTileIds = effect.mergedSourceTileIds ?? new Set();

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

    // 目标花：飞向 HUD 目标槽位（与蜂巢一致），而不是被吹散到屏幕外。
    if (isGoalKind?.(tile.kind.key)) {
      flights.push(new Promise((resolve) => {
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

    // 普通花：沿风车朝向吹散。
    const direction = getWindmillBurstDirection(tile, effect);
    tileView.burstTile(tile.id, {
      duration: windmillTimings.flowerFlyDuration,
      directionX: direction.x,
      directionY: direction.y,
    });
  }

  await Promise.all([
    wait(windmillTimings.burstDuration + windmillTimings.fadeDuration),
    ...childEffectPromises,
  ]);
}

async function animateHiveEffect({
  result,
  hiveEffect,
  effectByOriginId,
  launchSpecialEffect,
  ancestorEffectIds,
  animatedTileIds,
  flights,
  tileView,
  flyDuration,
  isGoalKind,
  getGoalRect,
  onGoalArrive,
}) {
  const beeArrivals = [];
  const childEffectPromises = [];
  const targetTileIds = hiveEffect.targetTileIds ?? new Set();
  const targets = result.removedTiles.filter((tile) => targetTileIds.has(tile.id));
  const originRect = tileView.getTileRect(hiveEffect.originTileId);

  targets.forEach((tile, index) => {
    const childEffect = effectByOriginId.get(tile.id);
    if (!childEffect && animatedTileIds.has(tile.id)) {
      return;
    }

    const beeDelay = index * HIVE_BEE_STAGGER;
    const isGoalTile = isGoalKind?.(tile.kind.key);

    if (isGoalTile && !childEffect) {
      animatedTileIds.add(tile.id);
      let resolveGoalFlight;
      const goalFlight = new Promise((resolve) => {
        resolveGoalFlight = resolve;
      });

      const beeArrival = new Promise((resolveBeeArrival) => {
        tileView.flyBee({
          fromTileId: hiveEffect.originTileId,
          fromRect: originRect,
          toTileId: tile.id,
          duration: HIVE_BEE_DURATION,
          delay: beeDelay,
          onArrive: () => {
            setTimeout(() => {
              tileView.flyTile(tile.id, {
                duration: flyDuration,
                targetRect: getGoalRect?.(tile.kind.key) ?? null,
                onArrive: () => {
                  onGoalArrive?.(tile);
                  resolveGoalFlight();
                },
              });
              resolveBeeArrival();
            }, HIVE_FLOWER_DELAY);
          },
        });
      });

      flights.push(goalFlight);
      beeArrivals.push(beeArrival);
      return;
    }

    if (!childEffect) {
      animatedTileIds.add(tile.id);
    }

    beeArrivals.push(new Promise((resolve) => {
      tileView.flyBee({
        fromTileId: hiveEffect.originTileId,
        fromRect: originRect,
        toTileId: tile.id,
        duration: HIVE_BEE_DURATION,
        delay: beeDelay,
        onArrive: () => {
          if (childEffect) {
            childEffectPromises.push(launchSpecialEffect(childEffect, ancestorEffectIds));
            resolve();
            return;
          }

          setTimeout(() => {
            tileView.flyTile(tile.id, { duration: flyDuration });
            resolve();
          }, HIVE_FLOWER_DELAY);
        },
      });
    }));
  });

  await Promise.all(beeArrivals);
  await new Promise((resolve) => {
    tileView.shrinkTile(hiveEffect.originTileId, {
      duration: HIVE_OPEN_DURATION,
      onArrive: resolve,
    });
  });
  await Promise.all(childEffectPromises);
}

function getWindmillTotalDuration(timings) {
  return timings.spinUpDuration + timings.burstDuration + timings.fadeDuration;
}

function getWindmillBurstDirection(tile, windmillEffect) {
  if (windmillEffect.type === MERGED_WINDMILL_TYPE) {
    const deltaX = tile.x - windmillEffect.originX;
    const deltaY = tile.y - windmillEffect.originY;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      return {
        x: deltaX === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(deltaX),
        y: (Math.random() - 0.5) * 0.2,
      };
    }

    return {
      x: (Math.random() - 0.5) * 0.2,
      y: deltaY === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(deltaY),
    };
  }

  if (windmillEffect.type === "windmillRow") {
    return {
      x: tile.x < windmillEffect.originX ? -1 : 1,
      y: (Math.random() - 0.5) * 0.18,
    };
  }

  return {
    x: (Math.random() - 0.5) * 0.18,
    y: tile.y < windmillEffect.originY ? -1 : 1,
  };
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

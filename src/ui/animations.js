import { wait } from "../utils/time.js";

const GROUP_FLY_STAGGER = 120;

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
  const flights = [];

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
  animateDrops(result.dropped, result.spawned, tileView);
  await wait(fallDuration);

  return {
    goalFlights: Promise.all(flights),
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

function animateDrops(dropped, spawned, tileView) {
  const metrics = tileView.getBoardMetrics();

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

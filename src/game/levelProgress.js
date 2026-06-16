import { getOrthogonalNeighbors, toCellKey } from "../utils/grid.js";

const BRICK_HIT_POINTS = 2;
const CRATE_HIT_POINTS = 1;

export function prepareLevelState(state, level) {
  state.isLevelCompleted = false;
  state.isLevelFailed = false;
  state.goalProgress = Object.fromEntries(level.goals.map((goal) => [goal.kind, 0]));
  state.movesUsed = 0;
  state.holes = new Set((level.holes ?? []).map(([x, y]) => `${x},${y}`));
  state.bricks = new Map((level.bricks ?? []).map(([x, y]) => [toCellKey(x, y), { x, y, damage: 0, hp: BRICK_HIT_POINTS }]));
  state.crates = new Map((level.crates ?? []).map(({ x, y }) => {
    return [
      toCellKey(x, y),
      {
        x,
        y,
        damage: 0,
        hp: CRATE_HIT_POINTS,
      },
    ];
  }));
}

export function isHoleCell(state, x, y) {
  return state.holes?.has(`${x},${y}`) ?? false;
}

export function isBrickCell(state, x, y) {
  return state.bricks?.has(toCellKey(x, y)) ?? false;
}

export function isCrateCell(state, x, y) {
  return state.crates?.has(toCellKey(x, y)) ?? false;
}

export function applyBrickDamage(state, removedTiles, columns, rows) {
  const damagedBricks = [];
  const brokenBricks = [];

  for (const tile of removedTiles) {
    for (const cell of getOrthogonalNeighbors(tile.x, tile.y, columns, rows)) {
      const key = toCellKey(cell.x, cell.y);
      const brick = state.bricks.get(key);
      if (!brick) {
        continue;
      }

      brick.damage += 1;
      if (brick.damage >= brick.hp) {
        state.bricks.delete(key);
        brokenBricks.push({ ...brick });
      } else {
        damagedBricks.push({ ...brick });
      }
    }
  }

  return { damagedBricks, brokenBricks };
}

export function applyCrateDamage(state, removedTiles, columns, rows) {
  const damagedCrates = [];
  const brokenCrates = [];

  for (const tile of removedTiles) {
    for (const cell of getOrthogonalNeighbors(tile.x, tile.y, columns, rows)) {
      const key = toCellKey(cell.x, cell.y);
      const crate = state.crates.get(key);
      if (!crate) {
        continue;
      }

      crate.damage += 1;
      if (crate.damage >= crate.hp) {
        state.crates.delete(key);
        brokenCrates.push({ ...crate });
      } else {
        damagedCrates.push({ ...crate });
      }
    }
  }

  return { damagedCrates, brokenCrates };
}

export function applyObstacleDamage(state, removedTiles, columns, rows) {
  const brickResult = applyBrickDamage(state, removedTiles, columns, rows);
  const crateResult = applyCrateDamage(state, removedTiles, columns, rows);

  return {
    ...brickResult,
    ...crateResult,
  };
}

export function recordRemovedTiles(state, removedTiles) {
  for (const tile of removedTiles) {
    if (!(tile.kind.key in state.goalProgress)) {
      continue;
    }

    state.goalProgress[tile.kind.key] += 1;
  }
}

export function isCurrentLevelComplete(state, level) {
  return level.goals.every((goal) => (state.goalProgress[goal.kind] ?? 0) >= goal.count);
}

export function getRemainingMoves(state, moveLimit) {
  return Math.max(moveLimit - state.movesUsed, 0);
}

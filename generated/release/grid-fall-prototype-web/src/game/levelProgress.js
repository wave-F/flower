export function prepareLevelState(state, level) {
  state.isLevelCompleted = false;
  state.isLevelFailed = false;
  state.goalProgress = Object.fromEntries(level.goals.map((goal) => [goal.kind, 0]));
  state.movesUsed = 0;
  state.holes = new Set((level.holes ?? []).map(([x, y]) => `${x},${y}`));
}

export function isHoleCell(state, x, y) {
  return state.holes?.has(`${x},${y}`) ?? false;
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

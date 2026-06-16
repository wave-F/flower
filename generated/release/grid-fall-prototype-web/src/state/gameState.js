export function createGameState(initialLevelIndex = 0) {
  return {
    board: [],
    tileIdSeed: 1,
    isProcessing: false,
    isLevelCompleted: false,
    isLevelFailed: false,
    currentLevelIndex: initialLevelIndex,
    goalProgress: {},
    movesUsed: 0,
    holes: new Set(),
    bricks: new Map(),
  };
}

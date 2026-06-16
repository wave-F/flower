export function createGameState(initialLevelIndex = 0) {
  return {
    board: [],
    recycleCharge: 0,
    recycleChargePreview: 0,
    tileIdSeed: 1,
    isProcessing: false,
    isLevelCompleted: false,
    isLevelFailed: false,
    currentLevelIndex: initialLevelIndex,
    goalProgress: {},
    movesUsed: 0,
    holes: new Set(),
    bricks: new Map(),
    crates: new Map(),
  };
}

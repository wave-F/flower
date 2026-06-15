export function createGameState(initialLevelIndex = 0) {
  return {
    board: [],
    trayTiles: [],
    trayCharge: 0,
    pendingTrayRewards: [],
    tileIdSeed: 1,
    isProcessing: false,
    isLevelCompleted: false,
    isLevelFailed: false,
    currentLevelIndex: initialLevelIndex,
    goalProgress: {},
    movesUsed: 0,
    holes: new Set(),
  };
}

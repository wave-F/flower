import {
  APP_TITLE,
  COLUMNS,
  ENTRY_GROW_DURATION,
  ENTRY_TILE_DELAY,
  FALL_DURATION,
  FLY_DURATION,
  MAX_BOARD_GENERATION_ATTEMPTS,
  MOVE_LIMIT,
  REMOVE_DURATION,
  ROWS,
} from "./config/constants.js";
import { LEVELS } from "./config/levels.js";
import { TILE_KINDS } from "./config/tileKinds.js";
import { applyRemovalsAndCollapse, createBoard, findTileById } from "./game/board.js";
import { isCurrentLevelComplete, getRemainingMoves, prepareLevelState } from "./game/levelProgress.js";
import { findMatchGroups } from "./game/match.js";
import { createGameState } from "./state/gameState.js";
import { columnLabel } from "./utils/grid.js";
import { animateBoardEntry, animateResolution } from "./ui/animations.js";
import { fitBoardToViewport, renderBoardSlots } from "./ui/boardLayout.js";
import { getDomElements } from "./ui/dom.js";
import { createHudView } from "./ui/hudView.js";
import { createTileView } from "./ui/tileView.js";

export function initialize(doc = globalThis.document) {
  if (!doc) {
    return null;
  }

  const elements = getDomElements(doc);
  const state = createGameState();
  const hudView = createHudView({
    elements,
    moveLimit: MOVE_LIMIT,
    appTitle: APP_TITLE,
  });
  const tileView = createTileView({
    tileLayerElement: elements.tileLayerElement,
    flyLayerElement: elements.flyLayerElement,
    boardElement: elements.boardElement,
    boardShellElement: elements.boardShellElement,
    getInteractionDisabled: () => state.isProcessing || state.isLevelCompleted || state.isLevelFailed,
  });

  fitBoardToViewport({
    boardElement: elements.boardElement,
    boardShellElement: elements.boardShellElement,
    tileLayerElement: elements.tileLayerElement,
    columns: COLUMNS,
    rows: ROWS,
  });
  renderBoardSlots({ boardElement: elements.boardElement, columns: COLUMNS, rows: ROWS });

  elements.boardShellElement.addEventListener("click", onBoardClick);
  elements.nextLevelButtonElement.addEventListener("click", onNextLevelButtonClick);
  window.addEventListener("resize", onViewportResize);
  window.addEventListener("orientationchange", onViewportResize);

  startFpsCounter();
  void resetBoard();

  return {
    resetBoard,
  };

  function startFpsCounter() {
    let frameCount = 0;
    let lastTime = performance.now();

    function update() {
      frameCount++;
      const currentTime = performance.now();
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        hudView.updateFps(fps);
        frameCount = 0;
        lastTime = currentTime;
      }
      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function onViewportResize() {
    fitBoardToViewport({
      boardElement: elements.boardElement,
      boardShellElement: elements.boardShellElement,
      tileLayerElement: elements.tileLayerElement,
      columns: COLUMNS,
      rows: ROWS,
    });
    renderBoardSlots({ boardElement: elements.boardElement, columns: COLUMNS, rows: ROWS });
    tileView.refreshTilePositions(state.board, ROWS, COLUMNS);
  }

  async function resetBoard() {
    if (state.isProcessing) {
      return;
    }

    prepareLevelState(state, getCurrentLevel());
    hudView.hideLevelOverlay();
    renderHud();
    state.isProcessing = true;
    tileView.syncInteractivity();
    hudView.setStatus("入场中", "花朵从土里依次长出");

    tileView.clearAllTiles();
    state.board = createBoard({
      state,
      columns: COLUMNS,
      rows: ROWS,
      tileKinds: TILE_KINDS,
      maxAttempts: MAX_BOARD_GENERATION_ATTEMPTS,
    });

    for (let x = 0; x < COLUMNS; x += 1) {
      for (let y = 0; y < ROWS; y += 1) {
        const tile = state.board[y][x];
        tileView.mountTileForEntry(tile);
      }
    }

    await animateBoardEntry({
      board: state.board,
      tileView,
      columns: COLUMNS,
      rows: ROWS,
      entryGrowDuration: ENTRY_GROW_DURATION,
      entryTileDelay: ENTRY_TILE_DELAY,
    });

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();
    hudView.setStatus("就绪", "等待点击");
  }

  function onBoardClick(event) {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const tileElement = event.target.closest(".tile");
    if (!tileElement || !elements.tileLayerElement.contains(tileElement)) {
      return;
    }

    const tile = findTileById({
      board: state.board,
      columns: COLUMNS,
      rows: ROWS,
      tileId: Number(tileElement.dataset.tileId),
    });
    if (!tile) {
      return;
    }

    void processTurn(tile);
  }

  async function processTurn(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    renderHud();
    tileView.syncInteractivity();
    hudView.setStatus(
      "结算中",
      `删除 ${columnLabel(tile.x)} 列 ${tile.y + 1} 行，还剩 ${getRemainingMoves(state, MOVE_LIMIT)} 步`,
    );

    const initialResult = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: [tile],
      columns: COLUMNS,
      rows: ROWS,
      state,
      tileKinds: TILE_KINDS,
    });
    const initialResolution = await animateResolution({
      result: initialResult,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalKind,
      getGoalRect: hudView.getGoalSwatchRect,
      onGoalArrive: handleGoalArrive,
    });

    const cascadeResult = await resolveBoardMatches("本次");
    await Promise.all([
      initialResolution.goalFlights,
      ...cascadeResult.goalFlights,
    ]);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      state.isLevelCompleted = true;
      state.isProcessing = false;
      tileView.syncInteractivity();
      renderHud();
      hudView.setStatus("关卡完成", `${getCurrentLevelLabel()} 已达成全部目标`);
      hudView.showLevelOverlay({
        title: "关卡完成",
        detail: `${getCurrentLevelLabel()} 已达成全部目标`,
        actionLabel: getActionButtonLabel(),
      });
      return;
    }

    if (state.movesUsed >= MOVE_LIMIT) {
      state.isLevelFailed = true;
      state.isProcessing = false;
      tileView.syncInteractivity();
      renderHud();
      hudView.setStatus("步数用尽", `${getCurrentLevelLabel()} 未完成目标，点击重试本关`);
      hudView.showLevelOverlay({
        title: "步数用尽",
        detail: `${getCurrentLevelLabel()} 未完成目标`,
        actionLabel: getActionButtonLabel(),
      });
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `本次触发 ${cascadeResult.cascadeCount} 次连锁`);
    } else {
      hudView.setStatus("就绪", "本次未形成连通块消除");
    }
  }

  async function resolveBoardMatches(contextLabel) {
    let cascadeCount = 0;
    const goalFlights = [];

    while (true) {
      const matchGroups = findMatchGroups(state.board, COLUMNS, ROWS);
      const matchedTiles = matchGroups.flat();
      if (matchedTiles.length === 0) {
        break;
      }

      cascadeCount += 1;
      hudView.setStatus("连锁中", `${contextLabel}第 ${cascadeCount} 次消除 ${matchedTiles.length} 个`);

      const result = applyRemovalsAndCollapse({
        board: state.board,
        tilesToRemove: matchedTiles,
        tileGroups: matchGroups,
        columns: COLUMNS,
        rows: ROWS,
        state,
        tileKinds: TILE_KINDS,
      });
      const resolution = await animateResolution({
        result,
        tileView,
        removeDuration: REMOVE_DURATION,
        fallDuration: FALL_DURATION,
        flyDuration: FLY_DURATION,
        isGoalKind,
        getGoalRect: hudView.getGoalSwatchRect,
        onGoalArrive: handleGoalArrive,
      });
      goalFlights.push(resolution.goalFlights);
    }

    return { cascadeCount, goalFlights };
  }

  function onNextLevelButtonClick() {
    if (state.isProcessing || (!state.isLevelCompleted && !state.isLevelFailed)) {
      return;
    }

    if (state.isLevelCompleted) {
      state.currentLevelIndex = state.currentLevelIndex < LEVELS.length - 1 ? state.currentLevelIndex + 1 : 0;
    }

    hudView.hideLevelOverlay();
    void resetBoard();
  }

  function isGoalKind(kind) {
    return kind in state.goalProgress;
  }

  function handleGoalArrive(tile) {
    if (!isGoalKind(tile.kind.key)) {
      return;
    }

    state.goalProgress[tile.kind.key] += 1;
    renderHud();
    hudView.bumpGoal(tile.kind.key);
  }

  function renderHud() {
    hudView.renderLevelHud({
      level: getCurrentLevel(),
      movesUsed: state.movesUsed,
      goalProgress: state.goalProgress,
    });
  }

  function getCurrentLevel() {
    return LEVELS[state.currentLevelIndex] ?? LEVELS[0];
  }

  function getCurrentLevelLabel() {
    return `第 ${getCurrentLevel().id} 关`;
  }

  function getActionButtonLabel() {
    if (state.isLevelFailed) {
      return "重试本关";
    }

    return state.currentLevelIndex < LEVELS.length - 1 ? "下一关" : "重新开始";
  }
}

if (typeof document !== "undefined") {
  initialize(document);
}

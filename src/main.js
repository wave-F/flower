import {
  APP_TITLE,
  COLUMNS,
  ENTRY_COLUMN_DELAY,
  ENTRY_FALL_DURATION,
  FALL_DURATION,
  MAX_BOARD_GENERATION_ATTEMPTS,
  MOVE_LIMIT,
  REMOVE_DURATION,
  ROWS,
} from "./config/constants.js";
import { LEVELS } from "./config/levels.js";
import { TILE_KINDS } from "./config/tileKinds.js";
import { applyRemovalsAndCollapse, createBoard, findTileById } from "./game/board.js";
import { isCurrentLevelComplete, getRemainingMoves, prepareLevelState, recordRemovedTiles } from "./game/levelProgress.js";
import { findMatches } from "./game/match.js";
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

  void resetBoard();

  return {
    resetBoard,
  };

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
    renderHud();
    state.isProcessing = true;
    tileView.syncInteractivity();
    hudView.setStatus("入场中", "按列从屏幕上方瀑布落入棋盘");

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
        tileView.mountTileForEntry(tile, ROWS - 1 - y);
      }
    }

    await animateBoardEntry({
      board: state.board,
      tileView,
      columns: COLUMNS,
      rows: ROWS,
      entryFallDuration: ENTRY_FALL_DURATION,
      entryColumnDelay: ENTRY_COLUMN_DELAY,
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
    recordRemovedTiles(state, initialResult.removedTiles);
    renderHud();
    await animateResolution({
      result: initialResult,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
    });

    const cascadeCount = await resolveBoardMatches("本次");

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      state.isLevelCompleted = true;
      state.isProcessing = false;
      tileView.syncInteractivity();
      renderHud();
      hudView.setStatus("关卡完成", `${getCurrentLevelLabel()} 已达成全部目标`);
      return;
    }

    if (state.movesUsed >= MOVE_LIMIT) {
      state.isLevelFailed = true;
      state.isProcessing = false;
      tileView.syncInteractivity();
      renderHud();
      hudView.setStatus("步数用尽", `${getCurrentLevelLabel()} 未完成目标，点击重试本关`);
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    if (cascadeCount > 0) {
      hudView.setStatus("就绪", `本次触发 ${cascadeCount} 次连锁`);
    } else {
      hudView.setStatus("就绪", "本次未形成连通块消除");
    }
  }

  async function resolveBoardMatches(contextLabel) {
    let cascadeCount = 0;

    while (true) {
      const matchedTiles = findMatches(state.board, COLUMNS, ROWS);
      if (matchedTiles.length === 0) {
        break;
      }

      cascadeCount += 1;
      hudView.setStatus("连锁中", `${contextLabel}第 ${cascadeCount} 次消除 ${matchedTiles.length} 个`);

      const result = applyRemovalsAndCollapse({
        board: state.board,
        tilesToRemove: matchedTiles,
        columns: COLUMNS,
        rows: ROWS,
        state,
        tileKinds: TILE_KINDS,
      });
      recordRemovedTiles(state, result.removedTiles);
      renderHud();
      await animateResolution({
        result,
        tileView,
        removeDuration: REMOVE_DURATION,
        fallDuration: FALL_DURATION,
      });
    }

    return cascadeCount;
  }

  function onNextLevelButtonClick() {
    if (state.isProcessing || (!state.isLevelCompleted && !state.isLevelFailed)) {
      return;
    }

    if (state.isLevelCompleted) {
      state.currentLevelIndex = state.currentLevelIndex < LEVELS.length - 1 ? state.currentLevelIndex + 1 : 0;
    }

    void resetBoard();
  }

  function renderHud() {
    hudView.renderLevelHud({
      level: getCurrentLevel(),
      movesUsed: state.movesUsed,
      goalProgress: state.goalProgress,
      isLevelCompleted: state.isLevelCompleted,
      isLevelFailed: state.isLevelFailed,
      actionButtonLabel: getActionButtonLabel(),
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

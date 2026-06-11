import {
  APP_TITLE,
  ENTRY_GROW_DURATION,
  ENTRY_TILE_DELAY,
  FALL_DURATION,
  FLY_DURATION,
  MAX_BOARD_GENERATION_ATTEMPTS,
  MAX_CASCADE_COUNT,
  REMOVE_DURATION,
} from "./config/constants.js";
import { LEVELS } from "./config/levels.js";
import { TILE_KIND_MAP } from "./config/tileKinds.js";
import { applyRemovalsAndCollapse, createBoard, createFixedBoard, findTileById } from "./game/board.js";
import { isCurrentLevelComplete, getRemainingMoves, prepareLevelState } from "./game/levelProgress.js";
import { findMatchGroups } from "./game/match.js";
import { createGameState } from "./state/gameState.js";
import { columnLabel } from "./utils/grid.js";
import { animateBoardEntry, animateResolution } from "./ui/animations.js";
import { fitBoardToViewport, renderBoardSlots } from "./ui/boardLayout.js";
import { getDomElements } from "./ui/dom.js";
import { createHudView } from "./ui/hudView.js";
import { createTileView } from "./ui/tileView.js";

// 关卡配置数字映射表。放在模块顶层，避免 initialize 早期读取时触发 TDZ。
const NUM_TO_TILE_KEY = {
  0: "grass", // 杂草
  1: "amber", // 橙色
  2: "mint", // 粉色
  3: "sky", // 黄色
  4: "violet", // 红色
  5: "rose", // 蓝色
  6: "gold", // 紫色
  7: "green", // 绿色
};

const FIRST_LEVEL_TUTORIAL = {
  levelId: 1,
  x: 2,
  y: 2,
  kind: "grass",
  tip: "点击拔出，下落花朵三连消除！",
};

const FIREWORK_ROW_TYPE = "fireworkRow";
const FIREWORK_COLUMN_TYPE = "fireworkColumn";

export function initialize(doc = globalThis.document) {
  if (!doc) {
    return null;
  }

  const elements = getDomElements(doc);
  const state = createGameState();
  const hudView = createHudView({
    elements,
    appTitle: APP_TITLE,
  });
  const tileView = createTileView({
    tileLayerElement: elements.tileLayerElement,
    flyLayerElement: elements.flyLayerElement,
    boardElement: elements.boardElement,
    boardShellElement: elements.boardShellElement,
    getInteractionDisabled: () => state.isProcessing || state.isLevelCompleted || state.isLevelFailed,
  });
  let isTutorialVisible = false;

  const { columns: initialCols, rows: initialRows } = getCurrentLevelSettings();
  fitBoardToViewport({
    boardElement: elements.boardElement,
    boardShellElement: elements.boardShellElement,
    tileLayerElement: elements.tileLayerElement,
    columns: initialCols,
    rows: initialRows,
  });
  renderBoardSlots({ boardElement: elements.boardElement, columns: initialCols, rows: initialRows });

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

  function getCurrentLevel() {
    const rawLevel = LEVELS[state.currentLevelIndex] ?? LEVELS[0];
    // 确保返回的是处理过数字 ID 的关卡对象
    return {
      ...rawLevel,
      tileKinds: rawLevel.tileKinds.map(item => typeof item === "number" ? NUM_TO_TILE_KEY[item] : item),
      goals: rawLevel.goals.map(goal => ({
        ...goal,
        kind: typeof goal.kind === "number" ? NUM_TO_TILE_KEY[goal.kind] : goal.kind
      }))
    };
  }

  function getCurrentLevelSettings() {
    const level = getCurrentLevel();
    return {
      level,
      columns: level.columns,
      rows: level.rows,
      moveLimit: level.moveLimit,
      tileKinds: level.tileKinds.map(key => TILE_KIND_MAP[key] ?? TILE_KIND_MAP["rose"]),
    };
  }

  function onViewportResize() {
    const { columns, rows } = getCurrentLevelSettings();
    fitBoardToViewport({
      boardElement: elements.boardElement,
      boardShellElement: elements.boardShellElement,
      tileLayerElement: elements.tileLayerElement,
      columns,
      rows,
    });
    renderBoardSlots({ boardElement: elements.boardElement, columns, rows });
    tileView.refreshTilePositions(state.board, rows, columns);
    positionTutorialGuide();
  }

  async function resetBoard() {
    if (state.isProcessing) {
      return;
    }

    const { level, columns, rows, tileKinds } = getCurrentLevelSettings();

    prepareLevelState(state, level);
    hudView.hideLevelOverlay();

    // Re-layout board for potential size change
    fitBoardToViewport({
      boardElement: elements.boardElement,
      boardShellElement: elements.boardShellElement,
      tileLayerElement: elements.tileLayerElement,
      columns,
      rows,
    });
    renderBoardSlots({ boardElement: elements.boardElement, columns, rows });

    renderHud();
    state.isProcessing = true;
    tileView.syncInteractivity();
    hudView.setStatus("入场中", "花朵从土里依次长出");

    tileView.clearAllTiles();
    
    if (level.initialBoard) {
      state.board = createFixedBoard({
        state,
        layout: level.initialBoard,
        tileKindMap: TILE_KIND_MAP,
      });
    } else {
      state.board = createBoard({
        state,
        columns,
        rows,
        tileKinds,
        maxAttempts: MAX_BOARD_GENERATION_ATTEMPTS,
      });
    }

    const entryMetrics = tileView.getBoardMetrics();

    for (let x = 0; x < columns; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const tile = state.board[y][x];
        tileView.mountTileForEntry(tile, entryMetrics);
      }
    }

    await animateBoardEntry({
      board: state.board,
      tileView,
      columns,
      rows,
      entryGrowDuration: ENTRY_GROW_DURATION,
      entryTileDelay: ENTRY_TILE_DELAY,
    });

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();
    hudView.setStatus("就绪", "等待点击");
    updateTutorialGuide();
  }

  function onBoardClick(event) {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const tileElement = event.target.closest(".tile");
    if (!tileElement || !elements.tileLayerElement.contains(tileElement)) {
      return;
    }

    const { columns, rows } = getCurrentLevelSettings();
    const tile = findTileById({
      board: state.board,
      columns,
      rows,
      tileId: Number(tileElement.dataset.tileId),
    });
    if (!tile) {
      return;
    }

    if (isTutorialVisible && !isTutorialTarget(tile)) {
      return;
    }

    if (isFireworkTile(tile)) {
      hideTutorialGuide();
      void processFirework(tile);
      return;
    }

    hideTutorialGuide();

    void processTurn(tile);
  }

  function updateTutorialGuide() {
    const targetTile = getTutorialTargetTile();
    if (!targetTile) {
      hideTutorialGuide();
      return;
    }

    elements.tutorialTipElement.textContent = FIRST_LEVEL_TUTORIAL.tip;
    elements.tutorialGuideElement.hidden = false;
    isTutorialVisible = true;
    positionTutorialGuide();
  }

  function positionTutorialGuide() {
    if (!isTutorialVisible) {
      return;
    }

    const targetTile = getTutorialTargetTile();
    if (!targetTile) {
      hideTutorialGuide();
      return;
    }

    const targetElement = tileView.getTileElement(targetTile.id);
    if (!targetElement) {
      return;
    }

    const tileRect = targetElement.getBoundingClientRect();
    const screenRect = elements.tutorialGuideElement.getBoundingClientRect();
    const centerX = tileRect.left - screenRect.left + tileRect.width * 0.58;
    const centerY = tileRect.top - screenRect.top + tileRect.height * 0.46;
    elements.tutorialHandElement.style.left = `${centerX}px`;
    elements.tutorialHandElement.style.top = `${centerY}px`;

    const tipWidth = Math.min(screenRect.width - 36, 320);
    const tipLeft = Math.max(18, Math.min(screenRect.width - tipWidth - 18, centerX - tipWidth / 2));
    const tipTop = tileRect.top - screenRect.top + tileRect.height * 2 + 18;
    elements.tutorialTipElement.style.width = `${tipWidth}px`;
    elements.tutorialTipElement.style.left = `${tipLeft}px`;
    elements.tutorialTipElement.style.top = `${tipTop}px`;
  }

  function hideTutorialGuide() {
    if (!isTutorialVisible) {
      return;
    }

    isTutorialVisible = false;
    elements.tutorialGuideElement.hidden = true;
  }

  function getTutorialTargetTile() {
    const level = getCurrentLevel();
    if (level.id !== FIRST_LEVEL_TUTORIAL.levelId) {
      return null;
    }

    const tile = state.board[FIRST_LEVEL_TUTORIAL.y]?.[FIRST_LEVEL_TUTORIAL.x] ?? null;
    if (!tile || tile.kind.key !== FIRST_LEVEL_TUTORIAL.kind) {
      return null;
    }

    return tile;
  }

  function isTutorialTarget(tile) {
    return tile.x === FIRST_LEVEL_TUTORIAL.x
      && tile.y === FIRST_LEVEL_TUTORIAL.y
      && tile.kind.key === FIRST_LEVEL_TUTORIAL.kind;
  }

  async function processTurn(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    const clickedCell = { x: tile.x, y: tile.y };
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, moveLimit, tileKinds } = getCurrentLevelSettings();
    hudView.setStatus(
      "结算中",
      `删除 ${columnLabel(tile.x)} 列 ${tile.y + 1} 行，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const initialResult = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: [tile],
      columns,
      rows,
      state,
      tileKinds,
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

    const cascadeResult = await resolveBoardMatches("本次", { clickedCell, previousResult: initialResult });
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

    if (state.movesUsed >= moveLimit) {
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

  async function processFirework(tile) {
    state.isProcessing = true;
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: tile.x, y: tile.y };
    const targets = getFireworkTargets(tile, columns, rows);
    const directionLabel = tile.special.type === FIREWORK_ROW_TYPE ? "横向" : "纵向";
    hudView.setStatus("礼花触发", `${directionLabel}礼花清除 ${targets.length} 个格子`);

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: targets,
      columns,
      rows,
      state,
      tileKinds,
    });
    result.fireworkEffect = {
      type: tile.special.type,
      originX: tile.x,
      originY: tile.y,
    };
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

    const cascadeResult = await resolveBoardMatches("礼花", { clickedCell, previousResult: result });
    await Promise.all([
      resolution.goalFlights,
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

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `礼花触发 ${cascadeResult.cascadeCount} 次连锁`);
    } else {
      hudView.setStatus("就绪", "礼花未形成后续连通块消除");
    }
  }

  async function resolveBoardMatches(contextLabel, { clickedCell, previousResult = null } = {}) {
    let cascadeCount = 0;
    const goalFlights = [];
    const { columns, rows, tileKinds } = getCurrentLevelSettings();

    while (cascadeCount < MAX_CASCADE_COUNT) {
      const matchGroups = findMatchGroups(state.board, columns, rows);
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
        columns,
        rows,
        state,
        tileKinds,
        specialCreationContext: createSpecialCreationContext(previousResult, clickedCell),
      });
      previousResult = result;
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

    if (cascadeCount >= MAX_CASCADE_COUNT) {
      hudView.setStatus("连锁停止", `${contextLabel}已达到 ${MAX_CASCADE_COUNT} 次连锁上限`);
    }

    return { cascadeCount, goalFlights };
  }

  function createSpecialCreationContext(previousResult, clickedCell) {
    if (!previousResult) {
      return { clickedCell, movedTileIds: new Set() };
    }

    return {
      clickedCell,
      movedTileIds: new Set([
        ...(previousResult.dropped ?? []).map((move) => move.tile.id),
        ...(previousResult.spawned ?? []).map((spawn) => spawn.tile.id),
        ...(previousResult.createdSpecialTiles ?? []).map((created) => created.tile.id),
      ]),
    };
  }

  function isFireworkTile(tile) {
    return tile.special?.type === FIREWORK_ROW_TYPE || tile.special?.type === FIREWORK_COLUMN_TYPE;
  }

  function getFireworkTargets(tile, columns, rows) {
    const targets = [];

    if (tile.special.type === FIREWORK_ROW_TYPE) {
      for (let x = 0; x < columns; x += 1) {
        const target = state.board[tile.y]?.[x] ?? null;
        if (target) {
          targets.push(target);
        }
      }
      return targets;
    }

    for (let y = 0; y < rows; y += 1) {
      const target = state.board[y]?.[tile.x] ?? null;
      if (target) {
        targets.push(target);
      }
    }

    return targets;
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

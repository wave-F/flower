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
import { isCurrentLevelComplete, getRemainingMoves, isHoleCell, prepareLevelState } from "./game/levelProgress.js";
import { findMatchGroups } from "./game/match.js";
import { createGameState } from "./state/gameState.js";
import { columnLabel } from "./utils/grid.js";
import { animateBoardEntry, animateResolution, animateWindmillFusion } from "./ui/animations.js";
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
  tip: "点击拔出杂草，下落花朵三连消除",
};

const PERSISTENT_HINT_TEXT = "点击拔出，下落花朵三连消除";

const WINDMILL_TYPE = "windmill";
const MERGED_WINDMILL_TYPE = "mergedWindmill";
const WINDMILL_KIND = { key: "windmill", label: "Windmill", name: "风车" };
const HIVE_TYPE = "hive";
const HIVE_KIND = { key: "hive", label: "Hive", name: "蜂巢" };
const HIVE_BEE_COUNT = 5;
const FIRST_SCREEN_STATIC_ASSET_PATHS = ["./assets/HandPointer.png"];

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
  renderBoardSlots({ boardElement: elements.boardElement, columns: initialCols, rows: initialRows, isHole });
  initializeDebugLevelPicker();

  elements.boardShellElement.addEventListener("click", onBoardClick);
  elements.nextLevelButtonElement.addEventListener("click", onNextLevelButtonClick);
  elements.debugWindmillButtonElement.addEventListener("click", onDebugWindmillButtonClick);
  elements.debugHiveButtonElement.addEventListener("click", onDebugHiveButtonClick);
  elements.debugLevelPickerButtonElement.addEventListener("click", onDebugLevelPickerButtonClick);
  elements.debugLevelJumpButtonElement.addEventListener("click", onDebugLevelJumpButtonClick);
  window.addEventListener("resize", onViewportResize);
  window.addEventListener("orientationchange", onViewportResize);

  startFpsCounter();
  const ready = resetBoard();

  return {
    resetBoard,
    ready,
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

  function isHole(x, y) {
    return isHoleCell(state, x, y);
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

  function initializeDebugLevelPicker() {
    const fragment = document.createDocumentFragment();

    LEVELS.forEach((level, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `第 ${level.id} 关`;
      fragment.appendChild(option);
    });

    elements.debugLevelSelectElement.innerHTML = "";
    elements.debugLevelSelectElement.appendChild(fragment);
    syncDebugLevelPicker();
  }

  function syncDebugLevelPicker() {
    elements.debugLevelSelectElement.value = String(state.currentLevelIndex);
  }

  function setDebugLevelPanelOpen(isOpen) {
    elements.debugLevelPanelElement.hidden = !isOpen;
    elements.debugLevelPickerButtonElement.setAttribute("aria-expanded", String(isOpen));
  }

  function onDebugLevelPickerButtonClick() {
    const nextOpen = elements.debugLevelPanelElement.hidden;
    syncDebugLevelPicker();
    setDebugLevelPanelOpen(nextOpen);
  }

  function onDebugLevelJumpButtonClick() {
    if (state.isProcessing) {
      return;
    }

    const nextIndex = Number(elements.debugLevelSelectElement.value);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= LEVELS.length) {
      return;
    }

    state.currentLevelIndex = nextIndex;
    setDebugLevelPanelOpen(false);
    void resetBoard();
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
    renderBoardSlots({ boardElement: elements.boardElement, columns, rows, isHole });
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
    renderBoardSlots({ boardElement: elements.boardElement, columns, rows, isHole });

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
        isHole,
      });
    } else {
      state.board = createBoard({
        state,
        columns,
        rows,
        tileKinds,
        maxAttempts: MAX_BOARD_GENERATION_ATTEMPTS,
        isHole,
      });
    }

    const entryMetrics = tileView.getBoardMetrics();

    for (let x = 0; x < columns; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const tile = state.board[y][x];
        if (!tile) {
          // 镂空格无棋子，跳过挂载
          continue;
        }

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

    const tutorialTargetTile = isTutorialVisible ? getTutorialTargetTile() : null;
    if (isTutorialVisible) {
      if (!tutorialTargetTile) {
        hideTutorialGuide();
        return;
      }

      if (tile.id !== tutorialTargetTile.id) {
        return;
      }
    }

    const didCompleteTutorial = isTutorialVisible && tile.id === tutorialTargetTile.id;

    if (isHiveTile(tile)) {
      hideTutorialGuide();
      if (didCompleteTutorial) {
        showPersistentHint();
      }
      void processHive(tile);
      return;
    }

    if (isWindmillTile(tile)) {
      const mergedWindmillPartner = findAdjacentWindmillPartner(tile, columns, rows);
      hideTutorialGuide();
      if (didCompleteTutorial) {
        showPersistentHint();
      }
      if (mergedWindmillPartner) {
        void processMergedWindmills(tile, mergedWindmillPartner);
        return;
      }
      void processWindmill(tile);
      return;
    }

    hideTutorialGuide();
    if (didCompleteTutorial) {
      showPersistentHint();
    }

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

  function showPersistentHint() {
    elements.persistentHintElement.textContent = PERSISTENT_HINT_TEXT;
    elements.persistentHintElement.hidden = false;
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
      isHole,
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

  async function processMergedWindmills(primaryTile, secondaryTile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, moveLimit, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: primaryTile.x, y: primaryTile.y };
    await animateWindmillFusion({
      primaryTileId: primaryTile.id,
      secondaryTileId: secondaryTile.id,
      tileView,
      onMerged: () => {
        primaryTile.special = { type: MERGED_WINDMILL_TYPE };
        tileView.updateTile(primaryTile);
      },
    });
    const specialChain = collectSpecialChain(primaryTile, columns, rows, {
      suppressedSpecialIds: new Set([secondaryTile.id]),
      mergedSourceTileIds: new Set([secondaryTile.id]),
    });
    hudView.setStatus(
      "大风车合成",
      `消耗 1 步，合成清除 3 行 3 列共 ${specialChain.tilesToRemove.length} 个格子，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: specialChain.tilesToRemove,
      columns,
      rows,
      state,
      tileKinds,
      isHole,
    });
    result.windmillEffects = specialChain.windmillEffects;
    result.hiveEffects = specialChain.hiveEffects;
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

    const cascadeResult = await resolveBoardMatches("大风车", { clickedCell, previousResult: result });
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
      hudView.setStatus("就绪", `大风车触发 ${cascadeResult.cascadeCount} 次连锁`);
    } else {
      hudView.setStatus("就绪", `大风车合成清除了 ${result.removedTiles.length} 个格子`);
    }
  }

  async function processWindmill(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, moveLimit, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: tile.x, y: tile.y };
    const specialChain = collectSpecialChain(tile, columns, rows);
    hudView.setStatus(
      "风车触发",
      `连锁触发 ${specialChain.triggeredSpecialCount} 个道具，影响 ${specialChain.tilesToRemove.length} 个格子，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: specialChain.tilesToRemove,
      columns,
      rows,
      state,
      tileKinds,
      isHole,
    });
    result.windmillEffects = specialChain.windmillEffects;
    result.hiveEffects = specialChain.hiveEffects;
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

    const cascadeResult = await resolveBoardMatches("风车", { clickedCell, previousResult: result });
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
      hudView.setStatus("就绪", `风车触发 ${cascadeResult.cascadeCount} 次连锁`);
    } else {
      hudView.setStatus("就绪", "风车未形成后续连通块消除");
    }
  }

  async function processHive(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, moveLimit, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: tile.x, y: tile.y };
    const specialChain = collectSpecialChain(tile, columns, rows);
    hudView.setStatus(
      "蜂巢触发",
      `连锁触发 ${specialChain.triggeredSpecialCount} 个道具，影响 ${specialChain.tilesToRemove.length} 个格子，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: specialChain.tilesToRemove,
      columns,
      rows,
      state,
      tileKinds,
      isHole,
    });
    result.windmillEffects = specialChain.windmillEffects;
    result.hiveEffects = specialChain.hiveEffects;
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

    const cascadeResult = await resolveBoardMatches("蜂巢", { clickedCell, previousResult: result });
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
      hudView.setStatus("就绪", `蜂巢触发 ${cascadeResult.cascadeCount} 次连锁`);
    } else {
      hudView.setStatus("就绪", "蜂巢未形成后续连通块消除");
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
        isHole,
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

  function isWindmillTile(tile) {
    return tile.special?.type === WINDMILL_TYPE
      || tile.special?.type === MERGED_WINDMILL_TYPE;
  }

  function isHiveTile(tile) {
    return tile.special?.type === HIVE_TYPE;
  }

  function onDebugWindmillButtonClick() {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const { columns, rows } = getCurrentLevelSettings();
    const target = pickRandomWindmillTestTarget(columns, rows);
    if (!target) {
      hudView.setStatus("测试道具", "当前没有可替换的普通花");
      return;
    }

    target.kind = WINDMILL_KIND;
    target.special = {
      type: WINDMILL_TYPE,
    };
    tileView.updateTile(target);
    hudView.setStatus("测试风车", `已在 ${columnLabel(target.x)} 列 ${target.y + 1} 行生成风车`);
  }

  function onDebugHiveButtonClick() {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const { columns, rows } = getCurrentLevelSettings();
    const target = pickRandomWindmillTestTarget(columns, rows);
    if (!target) {
      hudView.setStatus("测试蜂巢", "当前没有可替换的普通花");
      return;
    }

    target.kind = HIVE_KIND;
    target.special = { type: HIVE_TYPE };
    tileView.updateTile(target);
    hudView.setStatus("测试蜂巢", `已在 ${columnLabel(target.x)} 列 ${target.y + 1} 行生成蜂巢`);
  }

  function pickRandomWindmillTestTarget(columns, rows) {
    const flowerTiles = [];
    const fallbackTiles = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (!tile || tile.special) {
          continue;
        }

        fallbackTiles.push(tile);
        if (tile.kind.key !== "grass") {
          flowerTiles.push(tile);
        }
      }
    }

    const candidates = flowerTiles.length > 0 ? flowerTiles : fallbackTiles;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }

  function findAdjacentWindmillPartner(tile, columns, rows) {
    const neighborOffsets = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];

    for (const offset of neighborOffsets) {
      const nextX = tile.x + offset.x;
      const nextY = tile.y + offset.y;
      if (nextX < 0 || nextX >= columns || nextY < 0 || nextY >= rows) {
        continue;
      }

      const neighbor = state.board[nextY]?.[nextX] ?? null;
      if (isWindmillTile(neighbor)) {
        return neighbor;
      }
    }

    return null;
  }

  function collectMergedWindmillTargets(centerTile, columns, rows) {
    const targetsById = new Map();

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const targetRow = centerTile.y + offsetY;
      if (targetRow < 0 || targetRow >= rows) {
        continue;
      }

      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[targetRow]?.[x] ?? null;
        if (tile) {
          targetsById.set(tile.id, tile);
        }
      }
    }

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const targetColumn = centerTile.x + offsetX;
      if (targetColumn < 0 || targetColumn >= columns) {
        continue;
      }

      for (let y = 0; y < rows; y += 1) {
        const tile = state.board[y]?.[targetColumn] ?? null;
        if (tile) {
          targetsById.set(tile.id, tile);
        }
      }
    }

    return [...targetsById.values()];
  }

  function getWindmillTargets(tile, columns, rows) {
    if (tile.special.type === MERGED_WINDMILL_TYPE) {
      return collectMergedWindmillTargets(tile, columns, rows);
    }

    const targets = [];

    const offsets = [
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];

    for (const offset of offsets) {
      const targetX = tile.x + offset.x;
      const targetY = tile.y + offset.y;
      if (targetX < 0 || targetX >= columns || targetY < 0 || targetY >= rows) {
        continue;
      }

      const target = state.board[targetY]?.[targetX] ?? null;
      if (target) {
        targets.push(target);
      }
    }

    return targets;
  }

  function collectSpecialChain(
    sourceTile,
    columns,
    rows,
    { suppressedSpecialIds = new Set(), mergedSourceTileIds = new Set() } = {},
  ) {
    const tilesById = new Map();
    const claimedTargetIds = new Set();
    const queuedSpecialTiles = [sourceTile];
    const queuedSpecialIds = new Set([sourceTile.id]);
    const triggeredByTileId = new Map([[sourceTile.id, null]]);
    const triggeredSpecialIds = new Set();
    const windmillEffects = [];
    const hiveEffects = [];

    while (queuedSpecialTiles.length > 0) {
      const currentTile = queuedSpecialTiles.shift();
      if (!currentTile?.special || triggeredSpecialIds.has(currentTile.id)) {
        continue;
      }

      triggeredSpecialIds.add(currentTile.id);
      tilesById.set(currentTile.id, currentTile);

      const rawTargets = getSpecialTargets(currentTile, columns, rows);
      const targets = isHiveTile(currentTile)
        ? filterHiveTargets(rawTargets, { queuedSpecialIds, triggeredSpecialIds, claimedTargetIds })
        : rawTargets;
      for (const target of targets) {
        tilesById.set(target.id, target);
        if (!target.special) {
          claimedTargetIds.add(target.id);
        }
        if (
          target.special
          && !suppressedSpecialIds.has(target.id)
          && !triggeredSpecialIds.has(target.id)
          && !queuedSpecialIds.has(target.id)
        ) {
          queuedSpecialIds.add(target.id);
          triggeredByTileId.set(target.id, currentTile.id);
          queuedSpecialTiles.push(target);
        }
      }

      if (isWindmillTile(currentTile)) {
        for (const target of targets) {
          if (!target.special) {
            claimedTargetIds.add(target.id);
          }
        }

        windmillEffects.push({
          type: currentTile.special.type,
          originTileId: currentTile.id,
          originX: currentTile.x,
          originY: currentTile.y,
          triggeredByTileId: triggeredByTileId.get(currentTile.id) ?? null,
          mergedSourceTileIds: currentTile.id === sourceTile.id ? new Set(mergedSourceTileIds) : new Set(),
          targetTileIds: new Set(targets.map((target) => target.id)),
        });
      } else if (isHiveTile(currentTile)) {
        hiveEffects.push({
          originTileId: currentTile.id,
          originX: currentTile.x,
          originY: currentTile.y,
          triggeredByTileId: triggeredByTileId.get(currentTile.id) ?? null,
          targetTileIds: new Set(targets.map((target) => target.id)),
        });
      }
    }

    return {
      tilesToRemove: [...tilesById.values()],
      triggeredSpecialCount: triggeredSpecialIds.size,
      windmillEffects,
      hiveEffects,
    };
  }

  function filterHiveTargets(rawTargets, { queuedSpecialIds, triggeredSpecialIds, claimedTargetIds }) {
    const targets = [];

    for (const target of rawTargets) {
      if (target.special) {
        if (!queuedSpecialIds.has(target.id) && !triggeredSpecialIds.has(target.id)) {
          targets.push(target);
        }
        continue;
      }

      if (!claimedTargetIds.has(target.id)) {
        targets.push(target);
      }
    }

    return targets.slice(0, HIVE_BEE_COUNT);
  }

  function getSpecialTargets(tile, columns, rows) {
    if (isWindmillTile(tile)) {
      return getWindmillTargets(tile, columns, rows);
    }

    if (isHiveTile(tile)) {
      return getHiveTargets(tile, columns, rows);
    }

    return [];
  }

  function getHiveTargets(sourceTile, columns, rows) {
    const goalTiles = [];
    const specialTiles = [];
    const flowerTiles = [];
    const fallbackTiles = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (!tile || tile.id === sourceTile.id) {
          continue;
        }

        if (tile.special) {
          specialTiles.push(tile);
        } else if (isOutstandingGoalKind(tile.kind.key)) {
          goalTiles.push(tile);
        } else if (tile.kind.key !== "grass") {
          flowerTiles.push(tile);
        } else {
          fallbackTiles.push(tile);
        }
      }
    }

    const sortByDistance = (a, b) => {
      const distanceA = Math.abs(a.x - sourceTile.x) + Math.abs(a.y - sourceTile.y);
      const distanceB = Math.abs(b.x - sourceTile.x) + Math.abs(b.y - sourceTile.y);
      return distanceA - distanceB || a.y - b.y || a.x - b.x;
    };

    goalTiles.sort(sortByDistance);
    specialTiles.sort(sortByDistance);
    flowerTiles.sort(sortByDistance);
    fallbackTiles.sort(sortByDistance);

    return [...goalTiles, ...specialTiles, ...flowerTiles, ...fallbackTiles];
  }

  function isOutstandingGoalKind(kindKey) {
    const goal = getCurrentLevel().goals.find((item) => item.kind === kindKey);
    return Boolean(goal && (state.goalProgress[kindKey] ?? 0) < goal.count);
  }

  function onNextLevelButtonClick() {
    if (state.isProcessing || (!state.isLevelCompleted && !state.isLevelFailed)) {
      return;
    }

    if (state.isLevelCompleted) {
      state.currentLevelIndex = state.currentLevelIndex < LEVELS.length - 1 ? state.currentLevelIndex + 1 : 0;
    }

    hudView.hideLevelOverlay();
    syncDebugLevelPicker();
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
    syncDebugLevelPicker();
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

function createLoadingView(doc = globalThis.document) {
  const overlayElement = doc?.querySelector("#loadingOverlay");
  const messageElement = doc?.querySelector("#loadingMessage");
  const progressFillElement = doc?.querySelector("#loadingProgressFill");
  const progressTextElement = doc?.querySelector("#loadingProgressText");

  function setMessage(message) {
    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  function setProgress(completed, total) {
    const ratio = total > 0 ? Math.min(1, completed / total) : 1;
    const percent = Math.round(ratio * 100);

    if (progressFillElement) {
      progressFillElement.style.width = `${percent}%`;
    }

    if (progressTextElement) {
      progressTextElement.textContent = total > 0
        ? `${percent}% (${completed}/${total})`
        : `${percent}%`;
    }
  }

  function hide({ immediate = false } = {}) {
    if (!overlayElement) {
      return;
    }

    if (immediate) {
      overlayElement.hidden = true;
      overlayElement.classList.add("is-hidden");
      return;
    }

    overlayElement.classList.add("is-hidden");
  }

  return {
    setMessage,
    setProgress,
    hide,
  };
}

function normalizeTileKindKey(kind) {
  return typeof kind === "number" ? (NUM_TO_TILE_KEY[kind] ?? null) : kind;
}

function collectFirstScreenAssetPaths() {
  const firstLevel = LEVELS[0];
  const assetPaths = new Set(FIRST_SCREEN_STATIC_ASSET_PATHS);
  const tileKeys = new Set();

  if (!firstLevel) {
    return [...assetPaths];
  }

  if ((firstLevel.bricks?.length ?? 0) > 0) {
    for (const assetPath of BRICK_ASSET_PATHS) {
      assetPaths.add(assetPath);
    }
  }

  for (const goal of firstLevel.goals ?? []) {
    const key = normalizeTileKindKey(goal.kind);
    if (key) {
      tileKeys.add(key);
    }
  }

  if (firstLevel.initialBoard) {
    for (const row of firstLevel.initialBoard) {
      for (const cell of row) {
        const key = normalizeTileKindKey(cell);
        if (key) {
          tileKeys.add(key);
        }
      }
    }
  } else {
    for (const kind of firstLevel.tileKinds ?? []) {
      const key = normalizeTileKindKey(kind);
      if (key) {
        tileKeys.add(key);
      }
    }
  }

  for (const key of tileKeys) {
    const assetPath = TILE_KIND_MAP[key]?.assetPath;
    if (assetPath) {
      assetPaths.add(assetPath);
    }
  }

  return [...assetPaths];
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();

    const finish = (status) => {
      resolve({ src, status });
    };

    image.addEventListener("load", async () => {
      try {
        if (typeof image.decode === "function") {
          await image.decode();
        }
      } catch {
        // decode 失败时浏览器通常已经拿到资源，不阻塞进入游戏。
      }

      finish("loaded");
    }, { once: true });

    image.addEventListener("error", () => {
      finish("error");
    }, { once: true });

    image.src = src;
  });
}

async function preloadFirstScreenAssets(onProgress) {
  const assetPaths = collectFirstScreenAssetPaths();
  const total = assetPaths.length;
  let completed = 0;

  onProgress?.(completed, total);

  const results = await Promise.all(assetPaths.map(async (assetPath) => {
    const result = await preloadImage(assetPath);
    completed += 1;
    onProgress?.(completed, total);
    return result;
  }));

  return {
    assetPaths,
    results,
  };
}

async function bootstrap(doc = globalThis.document) {
  if (!doc) {
    return null;
  }

  const loadingView = createLoadingView(doc);
  loadingView.setMessage("正在加载首屏需要显示的图片资源...");

  const { results } = await preloadFirstScreenAssets((completed, total) => {
    loadingView.setProgress(completed, total);
    if (total > 0 && completed < total) {
      loadingView.setMessage(`正在加载首屏资源 ${completed} / ${total}`);
    }
  });

  const failedResults = results.filter((result) => result.status !== "loaded");
  if (failedResults.length > 0) {
    console.warn("Some first-screen assets failed to preload.", failedResults);
  }

  loadingView.setProgress(1, 1);
  loadingView.setMessage("资源已就绪，正在进入游戏...");
  loadingView.hide({ immediate: true });

  const app = initialize(doc);
  return app;
}

if (typeof document !== "undefined") {
  void bootstrap(document);
}

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
import { applyObstacleDamage, isBrickCell, isCrateCell, isCurrentLevelComplete, getRemainingMoves, isHoleCell, prepareLevelState } from "./game/levelProgress.js";
import { findMatchGroups } from "./game/match.js";
import { createGameState } from "./state/gameState.js";
import { columnLabel } from "./utils/grid.js";
import { wait } from "./utils/time.js";
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
  tip: "点击花朵或杂草直接消除",
};

const WINDMILL_TYPE = "windmill";
const MERGED_WINDMILL_TYPE = "mergedWindmill";
const WINDMILL_KIND = { key: "windmill", label: "Windmill", name: "风车" };
const BOMB_TYPE = "bomb";
const BOMB_KIND = { key: "bomb", label: "Bomb", name: "炸弹" };
const HIVE_TYPE = "hive";
const HIVE_KIND = { key: "hive", label: "Lightball", name: "光球" };
const HIVE_BEE_COUNT = 5;
const CLICK_HISTORY_SIZE = 5;
const ENDGAME_SPEED_STEPS = [1.1, 1.2, 1.3, 1.4, 1.5];
const FIRST_SCREEN_STATIC_ASSET_PATHS = ["./assets/HandPointer.png"];
const GRASS_KIND_KEY = "grass";
const RECYCLE_HIVE_THRESHOLD = 100;
const COLLECTION_TRAY_TIP = "消除杂花杂草，为彩虹花补充养分！";
const HIVE_REPLACE_DURATION = 150;
const HIVE_GROW_DURATION = 220;
const HIVE_REWARD_FLIGHT_DURATION = 720;
const ELIMINATION_COMBO_REWARD_FLIGHT_DURATION = 820;
const ELIMINATION_COMBO_REWARD_STAGGER = 90;
const RECYCLE_BATCH_LAUNCH_STAGGER = 300;
const RECYCLE_FINAL_SETTLE_DURATION = 280;
const ENABLE_TUTORIAL = false;
const ELIMINATION_COMBO_THRESHOLD = 20;
const BRICK_ASSET_PATHS = ["./assets/brick.png", "./assets/brick_2.png"];
const CRATE_ASSET_PATH = "./assets/box.png";
const ICE_ASSET_PATH = "./assets/ice.png";

export function initialize(doc = globalThis.document) {
  if (!doc) {
    return null;
  }

  const elements = getDomElements(doc);
  const state = createGameState();
  const hudView = createHudView({
    elements,
    appTitle: APP_TITLE,
    onEliminationComboResolve: queueEliminationComboReward,
  });
  const tileView = createTileView({
    brickLayerElement: elements.brickLayerElement,
    tileLayerElement: elements.tileLayerElement,
    flyLayerElement: elements.flyLayerElement,
    boardElement: elements.boardElement,
    boardShellElement: elements.boardShellElement,
    getInteractionDisabled: () => state.isProcessing || state.isLevelCompleted || state.isLevelFailed,
  });
  let isTutorialVisible = false;
  let collectionTrayTipTimer = null;
  let collectionTrayFullBloomTimer = null;
  let recycleChargeAnimationFrame = 0;
  let recycleChargeAnimationToken = 0;
  let eliminationComboRewardChain = Promise.resolve();
  let wasCollectionTrayFull = false;
  let hasCollectionTrayRendered = false;

  const { columns: initialCols, rows: initialRows } = getCurrentLevelSettings();
  fitBoardToViewport({
    boardElement: elements.boardElement,
    boardShellElement: elements.boardShellElement,
    brickLayerElement: elements.brickLayerElement,
    tileLayerElement: elements.tileLayerElement,
    columns: initialCols,
    rows: initialRows,
  });
  renderBoardSlots({ boardElement: elements.boardElement, columns: initialCols, rows: initialRows, isHole });
  renderCollectionTray();
  initializeDebugLevelPicker();

  elements.boardShellElement.addEventListener("click", onBoardClick);
  elements.collectionTrayElement.addEventListener("click", onCollectionTrayClick);
  elements.collectionTrayElement.addEventListener("keydown", onCollectionTrayKeyDown);
  elements.nextLevelButtonElement.addEventListener("click", onNextLevelButtonClick);
  elements.debugWindmillButtonElement.addEventListener("click", onDebugWindmillButtonClick);
  elements.debugBombButtonElement.addEventListener("click", onDebugBombButtonClick);
  elements.debugHiveButtonElement.addEventListener("click", onDebugHiveButtonClick);
  elements.debugDualHiveButtonElement.addEventListener("click", onDebugDualHiveButtonClick);
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

  function isBrick(x, y) {
    return isBrickCell(state, x, y);
  }

  function isCrate(x, y) {
    return isCrateCell(state, x, y);
  }

  function isBlocked(x, y) {
    return isBrick(x, y) || isCrate(x, y);
  }

  function renderObstacles(result = null) {
    updateObstacleGoalProgress("brick", result?.brokenBricks?.length ?? 0);
    updateObstacleGoalProgress("crate", result?.brokenCrates?.length ?? 0);

    if (result?.brokenBricks?.length) {
      tileView.playObstacleShatterEffects(result.brokenBricks, {
        type: "brick",
        assetPath: BRICK_ASSET_PATHS[0],
      });
    }

    if (result?.brokenCrates?.length) {
      tileView.playObstacleShatterEffects(result.brokenCrates, {
        type: "crate",
        assetPath: CRATE_ASSET_PATH,
      });
    }

    tileView.renderBricks(state.bricks, state.crates);
  }

  function updateObstacleGoalProgress(kind, brokenCount) {
    if (brokenCount <= 0 || !(kind in state.goalProgress)) {
      return;
    }

    const currentLevel = getCurrentLevel();
    const goalCount = currentLevel.goals.find((goal) => goal.kind === kind)?.count ?? 0;
    state.goalProgress[kind] = Math.min(
      goalCount,
      (state.goalProgress[kind] ?? 0) + brokenCount,
    );
    renderHud();
    hudView.bumpGoal(kind);
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
      brickLayerElement: elements.brickLayerElement,
      tileLayerElement: elements.tileLayerElement,
      columns,
      rows,
    });
    renderBoardSlots({ boardElement: elements.boardElement, columns, rows, isHole });
    tileView.refreshBrickPositions(state.bricks, state.crates);
    tileView.refreshTilePositions(state.board, rows, columns);
    hudView.positionCascadeToast();
    positionTutorialGuide();
  }

  async function resetBoard() {
    if (state.isProcessing) {
      return;
    }

    const { level, columns, rows, tileKinds } = getCurrentLevelSettings();

    prepareLevelState(state, level);
    state.recycleCharge = 0;
    state.recycleChargePreview = 0;
    hudView.hideLevelOverlay();
    hideTutorialGuide();
    renderCollectionTray();

    // Re-layout board for potential size change
    fitBoardToViewport({
      boardElement: elements.boardElement,
      boardShellElement: elements.boardShellElement,
      brickLayerElement: elements.brickLayerElement,
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
    tileView.clearBricks();
    
    if (level.initialBoard) {
      state.board = createFixedBoard({
        state,
        layout: level.initialBoard,
        tileKindMap: TILE_KIND_MAP,
        isBlocked,
        isHole,
      });
    } else {
      state.board = createBoard({
        state,
        columns,
        rows,
        tileKinds,
        maxAttempts: MAX_BOARD_GENERATION_ATTEMPTS,
        isBlocked,
        isHole,
      });
    }

    renderObstacles();

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

    if (isBombTile(tile)) {
      hideTutorialGuide();
      void processBomb(tile);
      return;
    }

    if (isHiveTile(tile)) {
      hideTutorialGuide();
      void processHive(tile);
      return;
    }

    if (isWindmillTile(tile)) {
      hideTutorialGuide();
      void processWindmill(tile);
      return;
    }

    hideTutorialGuide();
    void processTurn(tile);
  }

  function updateTutorialGuide() {
    if (!ENABLE_TUTORIAL) {
      hideTutorialGuide();
      return;
    }

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
    isTutorialVisible = false;
    elements.tutorialGuideElement.hidden = true;
  }

  function getTutorialTargetTile() {
    if (!ENABLE_TUTORIAL) {
      return null;
    }

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

  function stopRecycleChargeAnimation() {
    recycleChargeAnimationToken += 1;
    if (recycleChargeAnimationFrame) {
      cancelAnimationFrame(recycleChargeAnimationFrame);
      recycleChargeAnimationFrame = 0;
    }
  }

  function renderCollectionTray({ meterCharge = null, labelCharge = null, preserveAnimation = false } = {}) {
    if (!preserveAnimation) {
      stopRecycleChargeAnimation();
    }

    const fallbackCharge = Math.max(0, Math.min(RECYCLE_HIVE_THRESHOLD, state.recycleCharge + state.recycleChargePreview));
    const displayedMeterCharge = Math.max(0, Math.min(RECYCLE_HIVE_THRESHOLD, meterCharge ?? fallbackCharge));
    const displayedLabelCharge = Math.max(0, Math.min(RECYCLE_HIVE_THRESHOLD, labelCharge ?? displayedMeterCharge));
    const chargePercent = displayedMeterCharge / RECYCLE_HIVE_THRESHOLD;
    const isFullCharge = displayedMeterCharge >= RECYCLE_HIVE_THRESHOLD - 0.001;
    const formattedLabelCharge = formatChargeValue(displayedLabelCharge);
    const petalOpenProgress = Math.min(1, Math.max(0, Math.pow(chargePercent, 0.82)));

    let meterElement = elements.collectionTrayElement.querySelector(".energy-meter");
    let coreElement = meterElement?.querySelector(".energy-meter-core") ?? null;

    if (!meterElement || !coreElement) {
      elements.collectionTrayElement.innerHTML = "";
      meterElement = document.createElement("div");
      meterElement.className = "energy-meter";
      meterElement.setAttribute("aria-hidden", "true");

      const ringElement = document.createElement("span");
      ringElement.className = "energy-meter-ring";

      const bloomElement = document.createElement("span");
      bloomElement.className = "energy-meter-bloom";

      for (let index = 0; index < 6; index += 1) {
        const petalElement = document.createElement("span");
        petalElement.className = "energy-meter-petal";
        petalElement.style.setProperty("--petal-rotate", `${index * 60}deg`);
        petalElement.style.setProperty("--petal-delay", `${index * 28}ms`);
        bloomElement.appendChild(petalElement);
      }

      const orbGlowElement = document.createElement("span");
      orbGlowElement.className = "energy-meter-orb-glow";

      coreElement = document.createElement("span");
      coreElement.className = "energy-meter-core";

      meterElement.append(ringElement, bloomElement, orbGlowElement, coreElement);
      elements.collectionTrayElement.appendChild(meterElement);
    }

    meterElement.style.setProperty("--charge-progress", String(chargePercent));
    meterElement.style.setProperty("--petal-open-progress", String(petalOpenProgress));
    meterElement.classList.toggle("is-full", isFullCharge);
    elements.collectionTrayElement.setAttribute("aria-label", `当前光球能量 ${formattedLabelCharge} / ${RECYCLE_HIVE_THRESHOLD}`);
    elements.collectionTrayCountElement.textContent = `${formattedLabelCharge} / ${RECYCLE_HIVE_THRESHOLD}`;

    if (isFullCharge && hasCollectionTrayRendered && !wasCollectionTrayFull) {
      triggerCollectionTrayFullBloom(meterElement);
    }

    wasCollectionTrayFull = isFullCharge;
    hasCollectionTrayRendered = true;
  }

  function triggerCollectionTrayFullBloom(meterElement) {
    if (!meterElement) {
      return;
    }

    if (collectionTrayFullBloomTimer) {
      clearTimeout(collectionTrayFullBloomTimer);
      collectionTrayFullBloomTimer = null;
    }

    meterElement.classList.remove("is-blooming");
    void meterElement.offsetWidth;
    meterElement.classList.add("is-blooming");

    collectionTrayFullBloomTimer = window.setTimeout(() => {
      meterElement.classList.remove("is-blooming");
      collectionTrayFullBloomTimer = null;
    }, 760);
  }

  async function animateRecycleChargeSettle(fromCharge, toCharge, duration = RECYCLE_FINAL_SETTLE_DURATION) {
    stopRecycleChargeAnimation();

    const normalizedFromCharge = Math.max(0, Math.min(RECYCLE_HIVE_THRESHOLD, fromCharge));
    const normalizedToCharge = Math.max(0, Math.min(RECYCLE_HIVE_THRESHOLD, toCharge));
    if (Math.abs(normalizedFromCharge - normalizedToCharge) < 0.001) {
      renderCollectionTray();
      return;
    }

    const animationToken = recycleChargeAnimationToken + 1;
    recycleChargeAnimationToken = animationToken;

    await new Promise((resolve) => {
      const startTime = performance.now();
      const tick = (now) => {
        if (animationToken !== recycleChargeAnimationToken) {
          resolve();
          return;
        }

        const progress = Math.min(1, (now - startTime) / duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const currentCharge = normalizedFromCharge + (normalizedToCharge - normalizedFromCharge) * easedProgress;
        renderCollectionTray({
          meterCharge: currentCharge,
          labelCharge: currentCharge,
          preserveAnimation: true,
        });

        if (progress >= 1) {
          recycleChargeAnimationFrame = 0;
          resolve();
          return;
        }

        recycleChargeAnimationFrame = requestAnimationFrame(tick);
      };

      recycleChargeAnimationFrame = requestAnimationFrame(tick);
    });

    if (animationToken === recycleChargeAnimationToken) {
      renderCollectionTray();
    }
  }

  function onCollectionTrayClick() {
    showCollectionTrayTip();
  }

  function onCollectionTrayKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    showCollectionTrayTip();
  }

  function showCollectionTrayTip() {
    if (collectionTrayTipTimer) {
      clearTimeout(collectionTrayTipTimer);
      collectionTrayTipTimer = null;
    }

    elements.collectionTrayTipElement.textContent = COLLECTION_TRAY_TIP;
    elements.collectionTrayTipElement.hidden = false;
    elements.collectionTrayTipElement.classList.remove("is-visible");
    void elements.collectionTrayTipElement.offsetWidth;
    elements.collectionTrayTipElement.classList.add("is-visible");

    collectionTrayTipTimer = window.setTimeout(() => {
      elements.collectionTrayTipElement.classList.remove("is-visible");
      elements.collectionTrayTipElement.hidden = true;
      collectionTrayTipTimer = null;
    }, 2200);
  }

  function formatChargeValue(value) {
    const normalizedValue = Math.round(Math.max(0, value) * 2) / 2;
    return Number.isInteger(normalizedValue) ? String(normalizedValue) : normalizedValue.toFixed(1);
  }

  function queueEliminationComboReward(payload) {
    eliminationComboRewardChain = eliminationComboRewardChain
      .catch(() => {})
      .then(() => handleEliminationComboReward(payload));
    return eliminationComboRewardChain;
  }

  async function handleEliminationComboReward({ count, sourceRect } = {}) {
    if (!Number.isFinite(count) || count < ELIMINATION_COMBO_THRESHOLD) {
      return { chargeGain: 0, hiveCount: 0 };
    }

    if (state.isLevelCompleted) {
      return { chargeGain: 0, hiveCount: 0 };
    }

    while (state.isProcessing) {
      await wait(60);
    }

    if (state.isLevelCompleted) {
      return { chargeGain: 0, hiveCount: 0 };
    }

    const chargeGain = count / 2;
    const particleCount = Math.max(1, Math.floor(count / 5));
    const particleChargeGain = chargeGain / particleCount;
    const targetRect = getRecycleTargetRect();

    if (sourceRect && targetRect) {
      await Promise.all(
        Array.from({ length: particleCount }, (_, index) => new Promise((resolve) => {
          window.setTimeout(() => {
            tileView.flyLightballParticle({
              fromRect: sourceRect,
              targetRect,
              duration: ELIMINATION_COMBO_REWARD_FLIGHT_DURATION,
              delay: 0,
              spawnDuration: 120,
              holdDuration: 48,
              spawnOffsetX: (index - (particleCount - 1) / 2) * 8,
              spawnOffsetY: -Math.abs(index - (particleCount - 1) / 2) * 4,
              targetOffsetX: (index % 2 === 0 ? -1 : 1) * Math.min(12, 4 + index * 2),
              targetOffsetY: -Math.min(10, index * 2),
              arcMultiplier: 1.02 + Math.min(0.18, index * 0.04),
              liftMultiplier: 1.04 + Math.min(0.16, index * 0.03),
              curveSide: index % 2 === 0 ? -1 : 1,
              onArrive: () => {
                state.recycleChargePreview += particleChargeGain;
                renderCollectionTray();
                resolve();
              },
            });
          }, index * ELIMINATION_COMBO_REWARD_STAGGER);
        })),
      );
    } else {
      state.recycleChargePreview += chargeGain;
      renderCollectionTray();
    }

    return resolveRecycleProgress(chargeGain);
  }

  async function resolveRecycleProgress(chargeGain) {
    if (chargeGain <= 0) {
      state.recycleChargePreview = 0;
      renderCollectionTray();
      return { chargeGain: 0, hiveCount: 0 };
    }

    state.recycleChargePreview = 0;
    const totalCharge = state.recycleCharge + chargeGain;
    const spawnAttempts = Math.floor(totalCharge / RECYCLE_HIVE_THRESHOLD);
    const { columns, rows } = getCurrentLevelSettings();
    const reservedTileIds = new Set();
    const spawnTargets = [];
    let hiveCount = 0;
    let isBlockedAtThreshold = false;

    for (let spawnIndex = 0; spawnIndex < spawnAttempts; spawnIndex += 1) {
      const target = pickRandomReplaceableTile(columns, rows, reservedTileIds);
      if (!target) {
        isBlockedAtThreshold = true;
        break;
      }

      reservedTileIds.add(target.id);
      spawnTargets.push(target);
    }

    state.recycleCharge = Math.min(totalCharge, RECYCLE_HIVE_THRESHOLD);
    renderCollectionTray();

    if (spawnTargets.length > 0) {
      state.recycleCharge = RECYCLE_HIVE_THRESHOLD;
      renderCollectionTray();

      const spawnedHives = await Promise.all(
        spawnTargets.map((target, spawnIndex) => wait(spawnIndex * RECYCLE_BATCH_LAUNCH_STAGGER).then(() => spawnRecycleHive(target))),
      );
      hiveCount = spawnedHives.filter(Boolean).length;
    }

    const remainingCharge = totalCharge - hiveCount * RECYCLE_HIVE_THRESHOLD;
    const finalCharge = isBlockedAtThreshold ? RECYCLE_HIVE_THRESHOLD : remainingCharge;
    state.recycleCharge = finalCharge;

    if (!isBlockedAtThreshold && hiveCount > 0) {
      await animateRecycleChargeSettle(RECYCLE_HIVE_THRESHOLD, finalCharge);
    } else {
      renderCollectionTray();
    }

    return { chargeGain, hiveCount };
  }

  async function spawnRecycleHive(target) {
    if (!target) {
      return null;
    }

    hudView.setStatus("能量转化", `光球落在 ${columnLabel(target.x)} 列 ${target.y + 1} 行`);
    const recycleSourceRect = getRecycleSourceRect();
    if (recycleSourceRect) {
      await new Promise((resolve) => {
        tileView.flyRewardToTile({
          fromRect: recycleSourceRect,
          toTileId: target.id,
          assetPath: "./assets/item_ball.png",
          duration: HIVE_REWARD_FLIGHT_DURATION,
          onArrive: resolve,
        });
      });
    }

    await new Promise((resolve) => {
      tileView.shrinkTile(target.id, {
        duration: HIVE_REPLACE_DURATION,
        onArrive: resolve,
      });
    });

    target.kind = HIVE_KIND;
    target.special = { type: HIVE_TYPE };

    const metrics = tileView.getBoardMetrics();
    tileView.mountTileForEntry(target, metrics);
    await new Promise((resolve) => {
      tileView.growTileIntoBoard(target.id, {
        duration: HIVE_GROW_DURATION,
        column: target.x,
        row: target.y,
        metrics,
        onArrive: resolve,
      });
    });

    return target;
  }

  function createRecycleStatusSuffix({ chargeGain, hiveCount }) {
    const parts = [];
    if (chargeGain > 0) {
      parts.push(`充能 +${chargeGain}`);
    }
    if (hiveCount > 0) {
      parts.push(`自动生成光球 ${hiveCount} 个`);
    }

    return parts.length > 0 ? `，${parts.join("，")}` : "";
  }

  function isChargeableTile(tile) {
    return Boolean(tile) && !tile.special;
  }

  function collectExcludedHiveTargetTileIds({ hiveEffects = [] } = {}) {
    const excludedTileIds = new Set();

    for (const effect of hiveEffects) {
      for (const targetTileId of effect?.targetTileIds ?? []) {
        excludedTileIds.add(targetTileId);
      }
    }

    return excludedTileIds;
  }

  function collectSpecialChargeTileIds({ removedTiles = [], windmillEffects = [], bombEffects = [] } = {}) {
    const removedTileById = new Map(removedTiles.map((tile) => [tile.id, tile]));
    const chargeTileIds = new Set();

    for (const effect of [...windmillEffects, ...bombEffects]) {
      for (const targetTileId of effect?.targetTileIds ?? []) {
        const targetTile = removedTileById.get(targetTileId);
        if (!isChargeableTile(targetTile)) {
          continue;
        }

        chargeTileIds.add(targetTileId);
      }
    }

    return chargeTileIds;
  }

  function countRemovedFlowers(removedTiles, { excludedTileIds = null } = {}) {
    return removedTiles.reduce((sum, tile) => {
      if (!isChargeableTile(tile) || excludedTileIds?.has(tile.id)) {
        return sum;
      }

      return sum + 1;
    }, 0);
  }

  function createEliminationComboTracker() {
    let removedFlowerCount = 0;
    hudView.hideEliminationCombo({ immediate: true, collectReward: true });

    return {
      addRemovedTiles(removedTiles, options = {}) {
        removedFlowerCount += countRemovedFlowers(removedTiles, options);
        if (removedFlowerCount >= ELIMINATION_COMBO_THRESHOLD) {
          hudView.showEliminationCombo(removedFlowerCount);
        }
        return removedFlowerCount;
      },
      getTotal() {
        return removedFlowerCount;
      },
    };
  }

  async function finalizeEliminationCombo({ collectReward = true, immediate = false } = {}) {
    await Promise.resolve(hudView.hideEliminationCombo({ immediate, collectReward }));
  }

  function getRecycleSourceRect() {
    const coreRect = getRecycleCoreRect();
    if (coreRect) {
      return coreRect;
    }

    return elements.collectionTrayElement.getBoundingClientRect();
  }

  function getRecycleTargetRect() {
    const meterRect = elements.collectionTrayElement.querySelector(".energy-meter")?.getBoundingClientRect() ?? null;
    if (!meterRect) {
      return getRecycleSourceRect();
    }

    const coreRect = getRecycleCoreRect();
    if (coreRect) {
      return coreRect;
    }

    return {
      left: meterRect.left,
      top: meterRect.top,
      width: meterRect.width,
      height: meterRect.height,
      right: meterRect.right,
      bottom: meterRect.bottom,
    };
  }

  function getRecycleCoreRect() {
    return elements.collectionTrayElement.querySelector(".energy-meter-core")?.getBoundingClientRect() ?? null;
  }

  function createRecycleGoalProgressSnapshot() {
    return { ...state.goalProgress };
  }

  function classifyRemovedTiles(removedTiles, recycleGoalProgress, { excludedChargeTileIds = null } = {}) {
    const goalCounts = new Map(getCurrentLevel().goals.map((goal) => [goal.kind, goal.count]));
    const goalTileIds = new Set();
    const chargeTileIds = new Set();

    for (const tile of removedTiles) {
      if (!isChargeableTile(tile)) {
        continue;
      }

      if (excludedChargeTileIds?.has(tile.id)) {
        continue;
      }

      const goalCount = goalCounts.get(tile.kind.key);
      if (!goalCount) {
        chargeTileIds.add(tile.id);
        continue;
      }

      const progress = recycleGoalProgress[tile.kind.key] ?? 0;
      if (progress < goalCount) {
        goalTileIds.add(tile.id);
        recycleGoalProgress[tile.kind.key] = progress + 1;
        continue;
      }

      chargeTileIds.add(tile.id);
    }

    return {
      goalTileIds,
      chargeTileIds,
      chargeGain: chargeTileIds.size,
    };
  }

  function handleRecycleArrive() {
    state.recycleChargePreview += 1;
    renderCollectionTray();
  }

  async function processTurn(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    const eliminationComboTracker = createEliminationComboTracker();
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
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const initialRemovedTileResolution = classifyRemovedTiles(initialResult.removedTiles, recycleGoalProgress);
    eliminationComboTracker.addRemovedTiles(initialResult.removedTiles);
    const initialResolution = await animateResolution({
      result: initialResult,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalTile: (candidate) => initialRemovedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: (candidate) => initialRemovedTileResolution.chargeTileIds.has(candidate.id),
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onRecycleArrive: handleRecycleArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches("本次", {
      clickedCell,
      previousResult: initialResult,
      recycleGoalProgress,
      eliminationComboTracker,
    });
    await Promise.all([
      initialResolution.goalFlights,
      initialResolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);

    const recycleResult = await resolveRecycleProgress(initialRemovedTileResolution.chargeGain + cascadeResult.recycleChargeGain);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      await completeLevelWithCleanup();
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
      await finalizeEliminationCombo();
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    const recycleStatusSuffix = createRecycleStatusSuffix(recycleResult);
    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `本次触发 ${cascadeResult.cascadeCount} 次后续消除${recycleStatusSuffix}`);
    } else {
      hudView.setStatus("就绪", `本次未形成后续消除${recycleStatusSuffix}`);
    }
    await finalizeEliminationCombo();
  }

  async function processMergedWindmills(primaryTile, secondaryTile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    const eliminationComboTracker = createEliminationComboTracker();
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
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    result.windmillEffects = specialChain.windmillEffects;
    result.bombEffects = specialChain.bombEffects;
    result.hiveEffects = specialChain.hiveEffects;
    const excludedHiveTargetTileIds = collectExcludedHiveTargetTileIds(result);
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const initialRemovedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress, {
      excludedChargeTileIds: excludedHiveTargetTileIds,
    });
    eliminationComboTracker.addRemovedTiles(result.removedTiles, { excludedTileIds: excludedHiveTargetTileIds });
    const resolution = await animateResolution({
      result,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalTile: (candidate) => initialRemovedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: (candidate) => initialRemovedTileResolution.chargeTileIds.has(candidate.id),
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onRecycleArrive: handleRecycleArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches("大风车", {
      clickedCell,
      previousResult: result,
      recycleGoalProgress,
      eliminationComboTracker,
    });
    await Promise.all([
      resolution.goalFlights,
      resolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);

    const recycleResult = await resolveRecycleProgress(initialRemovedTileResolution.chargeGain + cascadeResult.recycleChargeGain);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      await completeLevelWithCleanup();
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
      await finalizeEliminationCombo();
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    const recycleStatusSuffix = createRecycleStatusSuffix(recycleResult);
    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `大风车触发后出现 ${cascadeResult.cascadeCount} 次后续消除${recycleStatusSuffix}`);
    } else {
      hudView.setStatus("就绪", `大风车合成清除了 ${result.removedTiles.length} 个格子${recycleStatusSuffix}`);
    }
    await finalizeEliminationCombo();
  }

  async function processWindmill(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    const eliminationComboTracker = createEliminationComboTracker();
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
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const initialRemovedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress);
    eliminationComboTracker.addRemovedTiles(result.removedTiles);
    result.windmillEffects = specialChain.windmillEffects;
    result.bombEffects = specialChain.bombEffects;
    result.hiveEffects = specialChain.hiveEffects;
    const resolution = await animateResolution({
      result,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalTile: (candidate) => initialRemovedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: (candidate) => initialRemovedTileResolution.chargeTileIds.has(candidate.id),
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onRecycleArrive: handleRecycleArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches("风车", {
      clickedCell,
      previousResult: result,
      recycleGoalProgress,
      eliminationComboTracker,
    });
    await Promise.all([
      resolution.goalFlights,
      resolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);

    const recycleResult = await resolveRecycleProgress(initialRemovedTileResolution.chargeGain + cascadeResult.recycleChargeGain);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      await completeLevelWithCleanup();
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
      await finalizeEliminationCombo();
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    const recycleStatusSuffix = createRecycleStatusSuffix(recycleResult);
    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `风车触发后出现 ${cascadeResult.cascadeCount} 次后续消除${recycleStatusSuffix}`);
    } else {
      hudView.setStatus("就绪", `风车未形成后续连通块消除${recycleStatusSuffix}`);
    }
    await finalizeEliminationCombo();
  }

  async function processHive(tile) {
    const { columns, rows } = getCurrentLevelSettings();
    const adjacentHive = findAdjacentHivePartner(tile, columns, rows);
    if (adjacentHive) {
      await processDualHive(tile, adjacentHive);
      return;
    }

    const selectedKindKey = pickRandomBoardFlowerKind();
    if (!selectedKindKey) {
      hudView.setStatus("光球待命", "当前场上没有可清除的花色");
      return;
    }

    const targetTiles = collectTilesByKindKey(selectedKindKey);
    if (targetTiles.length === 0) {
      hudView.setStatus("光球待命", "当前场上没有可清除的花色");
      return;
    }

    state.isProcessing = true;
    state.movesUsed += 1;
    const eliminationComboTracker = createEliminationComboTracker();
    renderHud();
    tileView.syncInteractivity();

    const { moveLimit, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: tile.x, y: tile.y };
    const targetKindName = TILE_KIND_MAP[selectedKindKey]?.name ?? selectedKindKey;

    hudView.setStatus(
      "光球触发",
      `随机锁定 ${targetKindName}，清除 ${targetTiles.length} 朵花，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: [tile, ...targetTiles],
      tileGroups: [[tile], targetTiles],
      columns,
      rows,
      state,
      tileKinds,
      specialCreationContext: { allowSpecialCreation: false },
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    result.hiveEffects = [
      {
        originTileId: tile.id,
        originX: tile.x,
        originY: tile.y,
        triggeredByTileId: null,
        targetTileIds: new Set(targetTiles.map((targetTile) => targetTile.id)),
      },
    ];
    const excludedHiveTargetTileIds = collectExcludedHiveTargetTileIds(result);
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const initialRemovedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress, {
      excludedChargeTileIds: excludedHiveTargetTileIds,
    });
    eliminationComboTracker.addRemovedTiles(result.removedTiles, { excludedTileIds: excludedHiveTargetTileIds });
    const resolution = await animateResolution({
      result,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalTile: (candidate) => initialRemovedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: (candidate) => initialRemovedTileResolution.chargeTileIds.has(candidate.id),
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onRecycleArrive: handleRecycleArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches("光球", {
      clickedCell,
      previousResult: result,
      recycleGoalProgress,
      eliminationComboTracker,
    });
    await Promise.all([
      resolution.goalFlights,
      resolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);

    const recycleResult = await resolveRecycleProgress(initialRemovedTileResolution.chargeGain + cascadeResult.recycleChargeGain);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      await completeLevelWithCleanup();
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
      await finalizeEliminationCombo();
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    const recycleStatusSuffix = createRecycleStatusSuffix(recycleResult);
    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `光球触发后出现 ${cascadeResult.cascadeCount} 次后续消除${recycleStatusSuffix}`);
    } else {
      hudView.setStatus("就绪", `光球清除了 ${targetKindName}${recycleStatusSuffix}`);
    }
    await finalizeEliminationCombo();
  }

  async function processDualHive(primaryTile, secondaryTile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    const eliminationComboTracker = createEliminationComboTracker();
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, moveLimit, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: primaryTile.x, y: primaryTile.y };
    const tilesToRemove = collectAllBoardTiles();
    const triggeredSpecialEffects = createBoardSpecialEffects(
      tilesToRemove.filter((candidate) => (
        candidate.id !== primaryTile.id
        && candidate.id !== secondaryTile.id
        && candidate.special
        && (isWindmillTile(candidate) || isBombTile(candidate))
      )),
      columns,
      rows,
      { triggeredByTileId: primaryTile.id },
    );

    hudView.setStatus(
      "双光球共鸣",
      `相邻光球引爆全盘，清除 ${tilesToRemove.length} 个格子，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove,
      tileGroups: [tilesToRemove],
      columns,
      rows,
      state,
      tileKinds,
      specialCreationContext: { allowSpecialCreation: false },
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    result.hiveEffects = [
      {
        type: HIVE_TYPE,
        mode: "dualBoardBurst",
        originTileId: primaryTile.id,
        secondaryTileId: secondaryTile.id,
        originX: primaryTile.x,
        originY: primaryTile.y,
        secondaryX: secondaryTile.x,
        secondaryY: secondaryTile.y,
        triggeredByTileId: null,
        targetTileIds: new Set(
          tilesToRemove
            .filter((candidate) => candidate.id !== primaryTile.id && candidate.id !== secondaryTile.id)
            .map((candidate) => candidate.id),
        ),
      },
    ];
    if (triggeredSpecialEffects.windmillEffects.length > 0) {
      result.windmillEffects = triggeredSpecialEffects.windmillEffects;
    }
    if (triggeredSpecialEffects.bombEffects.length > 0) {
      result.bombEffects = triggeredSpecialEffects.bombEffects;
    }
    const excludedHiveTargetTileIds = collectExcludedHiveTargetTileIds(result);
    const specialChargeTileIds = collectSpecialChargeTileIds(result);
    specialChargeTileIds.forEach((tileId) => excludedHiveTargetTileIds.delete(tileId));
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const initialRemovedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress, {
      excludedChargeTileIds: excludedHiveTargetTileIds,
    });
    eliminationComboTracker.addRemovedTiles(result.removedTiles, { excludedTileIds: excludedHiveTargetTileIds });
    const resolution = await animateResolution({
      result,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalTile: (candidate) => initialRemovedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: (candidate) => initialRemovedTileResolution.chargeTileIds.has(candidate.id),
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onRecycleArrive: handleRecycleArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches("双光球", {
      clickedCell,
      previousResult: result,
      recycleGoalProgress,
      eliminationComboTracker,
    });
    await Promise.all([
      resolution.goalFlights,
      resolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);

    const recycleResult = await resolveRecycleProgress(initialRemovedTileResolution.chargeGain + cascadeResult.recycleChargeGain);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      await completeLevelWithCleanup();
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
      await finalizeEliminationCombo();
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    const recycleStatusSuffix = createRecycleStatusSuffix(recycleResult);
    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `双光球爆炸后出现 ${cascadeResult.cascadeCount} 次后续消除${recycleStatusSuffix}`);
    } else {
      hudView.setStatus("就绪", `双光球清空全盘${recycleStatusSuffix}`);
    }
    await finalizeEliminationCombo();
  }

  async function processBomb(tile) {
    state.isProcessing = true;
    state.movesUsed += 1;
    const eliminationComboTracker = createEliminationComboTracker();
    renderHud();
    tileView.syncInteractivity();

    const { columns, rows, moveLimit, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: tile.x, y: tile.y };
    const specialChain = collectSpecialChain(tile, columns, rows);
    hudView.setStatus(
      "炸弹触发",
      `连锁触发 ${specialChain.triggeredSpecialCount} 个道具，影响 ${specialChain.tilesToRemove.length} 个格子，还剩 ${getRemainingMoves(state, moveLimit)} 步`,
    );

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: specialChain.tilesToRemove,
      columns,
      rows,
      state,
      tileKinds,
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    result.windmillEffects = specialChain.windmillEffects;
    result.bombEffects = specialChain.bombEffects;
    result.hiveEffects = specialChain.hiveEffects;
    const excludedHiveTargetTileIds = collectExcludedHiveTargetTileIds(result);
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const initialRemovedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress, {
      excludedChargeTileIds: excludedHiveTargetTileIds,
    });
    eliminationComboTracker.addRemovedTiles(result.removedTiles, { excludedTileIds: excludedHiveTargetTileIds });
    const resolution = await animateResolution({
      result,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      isGoalTile: (candidate) => initialRemovedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: (candidate) => initialRemovedTileResolution.chargeTileIds.has(candidate.id),
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onRecycleArrive: handleRecycleArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches("炸弹", {
      clickedCell,
      previousResult: result,
      recycleGoalProgress,
      eliminationComboTracker,
    });
    await Promise.all([
      resolution.goalFlights,
      resolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);

    const recycleResult = await resolveRecycleProgress(initialRemovedTileResolution.chargeGain + cascadeResult.recycleChargeGain);

    if (isCurrentLevelComplete(state, getCurrentLevel())) {
      await completeLevelWithCleanup();
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
      await finalizeEliminationCombo();
      return;
    }

    state.isProcessing = false;
    tileView.syncInteractivity();
    renderHud();

    const recycleStatusSuffix = createRecycleStatusSuffix(recycleResult);
    if (cascadeResult.cascadeCount > 0) {
      hudView.setStatus("就绪", `炸弹触发后出现 ${cascadeResult.cascadeCount} 次后续消除${recycleStatusSuffix}`);
    } else {
      hudView.setStatus("就绪", `炸弹清除了 ${result.removedTiles.length} 个格子${recycleStatusSuffix}`);
    }
    await finalizeEliminationCombo();
  }

  async function resolveBoardMatches(contextLabel, {
    clickedCell,
    previousResult = null,
    recycleGoalProgress = createRecycleGoalProgressSnapshot(),
    allowSpecialCreation = true,
    countRecycle = true,
    eliminationComboTracker = null,
    speedMultiplier = 1,
    consumeSpeedMultiplier = null,
  } = {}) {
    let cascadeCount = 0;
    let recycleChargeGain = 0;
    const goalFlights = [];
    const recycleFlights = [];
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
        applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
        isBlocked,
        isHole,
        specialCreationContext: createSpecialCreationContext(previousResult, clickedCell, allowSpecialCreation),
      });
      const excludedHiveTargetTileIds = collectExcludedHiveTargetTileIds(result);
      const removedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress, {
        excludedChargeTileIds: excludedHiveTargetTileIds,
      });
      eliminationComboTracker?.addRemovedTiles(result.removedTiles, { excludedTileIds: excludedHiveTargetTileIds });
      if (countRecycle) {
        recycleChargeGain += removedTileResolution.chargeGain;
      }
      previousResult = result;
      const resolutionSpeedMultiplier = consumeSpeedMultiplier?.() ?? speedMultiplier;
      const resolution = await animateResolution({
        result,
        tileView,
        removeDuration: REMOVE_DURATION,
        fallDuration: FALL_DURATION,
        flyDuration: FLY_DURATION,
        speedMultiplier: resolutionSpeedMultiplier,
        isGoalTile: (candidate) => removedTileResolution.goalTileIds.has(candidate.id),
        shouldChargeTile: countRecycle
          ? (candidate) => removedTileResolution.chargeTileIds.has(candidate.id)
          : () => false,
        getGoalRect: hudView.getGoalSwatchRect,
        getRecycleRect: getRecycleTargetRect,
        onGoalArrive: handleGoalArrive,
        onRecycleArrive: countRecycle ? handleRecycleArrive : undefined,
        onAfterRemoval: renderObstacles,
      });
      goalFlights.push(resolution.goalFlights);
      recycleFlights.push(resolution.recycleFlights);
    }

    if (cascadeCount >= MAX_CASCADE_COUNT) {
      hudView.setStatus("后续消除停止", `${contextLabel}已达到 ${MAX_CASCADE_COUNT} 次后续消除上限`);
    }

    return { cascadeCount, goalFlights, recycleFlights, recycleChargeGain };
  }

  async function completeLevelWithCleanup() {
    await runEndgameSpecialCleanup();
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
    await finalizeEliminationCombo();
  }

  async function runEndgameSpecialCleanup() {
    const { columns, rows } = getCurrentLevelSettings();
    const specialTiles = getEndgameSpecialTiles();
    if (specialTiles.length === 0) {
      return;
    }

    const speedController = createEndgameSpeedController();
    const dualHivePair = findEndgameDualHivePair(specialTiles, columns, rows);
    hudView.setStatus("收尾结算", `同时激活剩余道具 ${specialTiles.length} 个`);

    if (dualHivePair) {
      await resolveEndgameSpecialTile(dualHivePair[0], speedController);
      return;
    }

    await resolveEndgameSpecialBatch(specialTiles, speedController);
  }

  async function resolveEndgameSpecialTile(tile, speedController) {
    const { columns, rows, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: tile.x, y: tile.y };
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();

    if (isHiveTile(tile)) {
      const adjacentHive = findAdjacentHivePartner(tile, columns, rows);
      if (adjacentHive) {
        await resolveEndgameDualHive(tile, adjacentHive, clickedCell, recycleGoalProgress, columns, rows, tileKinds, speedController);
        return;
      }

      await resolveEndgameHive(tile, clickedCell, recycleGoalProgress, columns, rows, tileKinds, speedController);
      return;
    }

    await resolveEndgameChain(tile, clickedCell, recycleGoalProgress, columns, rows, tileKinds, speedController);
  }

  async function resolveEndgameSpecialBatch(specialTiles, speedController) {
    if (specialTiles.length === 0) {
      return;
    }

    const { columns, rows, tileKinds } = getCurrentLevelSettings();
    const clickedCell = { x: specialTiles[0].x, y: specialTiles[0].y };
    const recycleGoalProgress = createRecycleGoalProgressSnapshot();
    const tilesToRemoveById = new Map();
    const windmillEffects = [];
    const bombEffects = [];
    const hiveEffects = [];

    for (const tile of specialTiles) {
      const currentTile = state.board[tile.y]?.[tile.x] ?? null;
      if (!currentTile?.special || currentTile.id !== tile.id) {
        continue;
      }

      if (isHiveTile(currentTile)) {
        const selectedKindKey = pickRandomBoardFlowerKind();
        const targetTiles = selectedKindKey ? collectTilesByKindKey(selectedKindKey) : [];
        tilesToRemoveById.set(currentTile.id, currentTile);
        targetTiles.forEach((targetTile) => tilesToRemoveById.set(targetTile.id, targetTile));

        if (targetTiles.length > 0) {
          hiveEffects.push({
            originTileId: currentTile.id,
            originX: currentTile.x,
            originY: currentTile.y,
            triggeredByTileId: null,
            targetTileIds: new Set(targetTiles.map((targetTile) => targetTile.id)),
          });
        }
        continue;
      }

      const targets = getSpecialTargets(currentTile, columns, rows);
      targets.forEach((targetTile) => tilesToRemoveById.set(targetTile.id, targetTile));

      if (isWindmillTile(currentTile)) {
        windmillEffects.push({
          type: currentTile.special.type,
          originTileId: currentTile.id,
          originX: currentTile.x,
          originY: currentTile.y,
          triggeredByTileId: null,
          mergedSourceTileIds: new Set(),
          targetTileIds: new Set(targets.map((targetTile) => targetTile.id)),
        });
        continue;
      }

      if (isBombTile(currentTile)) {
        bombEffects.push({
          type: currentTile.special.type,
          originTileId: currentTile.id,
          originX: currentTile.x,
          originY: currentTile.y,
          triggeredByTileId: null,
          targetTileIds: new Set(targets.map((targetTile) => targetTile.id)),
        });
      }
    }

    const tilesToRemove = [...tilesToRemoveById.values()];
    if (tilesToRemove.length === 0) {
      return;
    }

    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove,
      tileGroups: [tilesToRemove],
      columns,
      rows,
      state,
      tileKinds,
      specialCreationContext: { allowSpecialCreation: false, clickedCell },
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });

    if (windmillEffects.length > 0) {
      result.windmillEffects = windmillEffects;
    }
    if (bombEffects.length > 0) {
      result.bombEffects = bombEffects;
    }
    if (hiveEffects.length > 0) {
      result.hiveEffects = hiveEffects;
    }

    await finalizeEndgameResult({ result, clickedCell, recycleGoalProgress, contextLabel: "收尾", speedController });
  }

  async function resolveEndgameChain(tile, clickedCell, recycleGoalProgress, columns, rows, tileKinds, speedController) {
    const suppressedSpecialIds = new Set(
      collectAllBoardTiles()
        .filter((candidate) => candidate.id !== tile.id && isHiveTile(candidate))
        .map((candidate) => candidate.id),
    );
    const specialChain = collectSpecialChain(tile, columns, rows, { suppressedSpecialIds });
    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: specialChain.tilesToRemove,
      columns,
      rows,
      state,
      tileKinds,
      specialCreationContext: { allowSpecialCreation: false, clickedCell },
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    result.windmillEffects = specialChain.windmillEffects;
    result.bombEffects = specialChain.bombEffects;
    result.hiveEffects = specialChain.hiveEffects;
    await finalizeEndgameResult({ result, clickedCell, recycleGoalProgress, contextLabel: "收尾", speedController });
  }

  async function resolveEndgameHive(tile, clickedCell, recycleGoalProgress, columns, rows, tileKinds, speedController) {
    const selectedKindKey = pickRandomBoardFlowerKind();
    const targetTiles = selectedKindKey ? collectTilesByKindKey(selectedKindKey) : [];
    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove: [tile, ...targetTiles],
      tileGroups: targetTiles.length > 0 ? [[tile], targetTiles] : [[tile]],
      columns,
      rows,
      state,
      tileKinds,
      specialCreationContext: { allowSpecialCreation: false, clickedCell },
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });

    if (targetTiles.length > 0) {
      result.hiveEffects = [{
        originTileId: tile.id,
        originX: tile.x,
        originY: tile.y,
        triggeredByTileId: null,
        targetTileIds: new Set(targetTiles.map((targetTile) => targetTile.id)),
      }];
    }

    await finalizeEndgameResult({ result, clickedCell, recycleGoalProgress, contextLabel: "收尾", speedController });
  }

  async function resolveEndgameDualHive(primaryTile, secondaryTile, clickedCell, recycleGoalProgress, columns, rows, tileKinds, speedController) {
    const tilesToRemove = collectAllBoardTiles();
    const result = applyRemovalsAndCollapse({
      board: state.board,
      tilesToRemove,
      tileGroups: [tilesToRemove],
      columns,
      rows,
      state,
      tileKinds,
      specialCreationContext: { allowSpecialCreation: false, clickedCell },
      applyObstacleDamage: (removedTiles) => applyObstacleDamage(state, removedTiles, columns, rows),
      isBlocked,
      isHole,
    });
    result.hiveEffects = [{
      type: HIVE_TYPE,
      mode: "dualBoardBurst",
      originTileId: primaryTile.id,
      secondaryTileId: secondaryTile.id,
      originX: primaryTile.x,
      originY: primaryTile.y,
      secondaryX: secondaryTile.x,
      secondaryY: secondaryTile.y,
      triggeredByTileId: null,
      targetTileIds: new Set(
        tilesToRemove
          .filter((candidate) => candidate.id !== primaryTile.id && candidate.id !== secondaryTile.id)
          .map((candidate) => candidate.id),
      ),
    }];
    await finalizeEndgameResult({ result, clickedCell, recycleGoalProgress, contextLabel: "收尾", speedController });
  }

  async function finalizeEndgameResult({ result, clickedCell, recycleGoalProgress, contextLabel, speedController }) {
    const removedTileResolution = classifyRemovedTiles(result.removedTiles, recycleGoalProgress);
    const openingSpeedMultiplier = speedController?.next() ?? 1;
    const resolution = await animateResolution({
      result,
      tileView,
      removeDuration: REMOVE_DURATION,
      fallDuration: FALL_DURATION,
      flyDuration: FLY_DURATION,
      speedMultiplier: openingSpeedMultiplier,
      isGoalTile: (candidate) => removedTileResolution.goalTileIds.has(candidate.id),
      shouldChargeTile: () => false,
      getGoalRect: hudView.getGoalSwatchRect,
      getRecycleRect: getRecycleTargetRect,
      onGoalArrive: handleGoalArrive,
      onAfterRemoval: renderObstacles,
    });

    const cascadeResult = await resolveBoardMatches(contextLabel, {
      clickedCell,
      previousResult: result,
      recycleGoalProgress,
      allowSpecialCreation: false,
      countRecycle: false,
      consumeSpeedMultiplier: () => speedController?.next() ?? openingSpeedMultiplier,
    });

    await Promise.all([
      resolution.goalFlights,
      resolution.recycleFlights,
      ...cascadeResult.goalFlights,
      ...cascadeResult.recycleFlights,
    ]);
  }

  function getEndgameSpecialTiles() {
    const { columns, rows } = getCurrentLevelSettings();
    const specialTiles = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (tile?.special) {
          specialTiles.push(tile);
        }
      }
    }

    specialTiles.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
    return specialTiles;
  }

  function pickEndgameSpecialTile() {
    return getEndgameSpecialTiles()[0] ?? null;
  }

  function findEndgameDualHivePair(specialTiles, columns, rows) {
    const specialIds = new Set(specialTiles.map((tile) => tile.id));

    for (const tile of specialTiles) {
      if (!isHiveTile(tile)) {
        continue;
      }

      const partner = findAdjacentHivePartner(tile, columns, rows);
      if (partner && specialIds.has(partner.id)) {
        return [tile, partner];
      }
    }

    return null;
  }

  function createEndgameSpeedController() {
    let index = 0;

    return {
      next() {
        const speed = ENDGAME_SPEED_STEPS[Math.min(index, ENDGAME_SPEED_STEPS.length - 1)];
        index += 1;
        return speed;
      },
    };
  }

  function createSpecialCreationContext(previousResult, clickedCell, allowSpecialCreation = true) {
    if (!previousResult) {
      return { clickedCell, movedTileIds: new Set(), allowSpecialCreation };
    }

    return {
      clickedCell,
      allowSpecialCreation,
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

  function isBombTile(tile) {
    return tile.special?.type === BOMB_TYPE;
  }

  function isHiveTile(tile) {
    return tile.special?.type === HIVE_TYPE;
  }

  function onDebugWindmillButtonClick() {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const { columns, rows } = getCurrentLevelSettings();
    const target = pickRandomReplaceableTile(columns, rows);
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
    const target = pickRandomReplaceableTile(columns, rows);
    if (!target) {
      hudView.setStatus("测试光球", "当前没有可替换的普通花");
      return;
    }

    target.kind = HIVE_KIND;
    target.special = { type: HIVE_TYPE };
    tileView.updateTile(target);
    hudView.setStatus("测试光球", `已在 ${columnLabel(target.x)} 列 ${target.y + 1} 行生成光球`);
  }

  function onDebugDualHiveButtonClick() {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const { columns, rows } = getCurrentLevelSettings();
    const pair = pickAdjacentReplaceableHivePair(columns, rows);
    if (!pair) {
      hudView.setStatus("测试双光球", "当前没有可替换的相邻普通花");
      return;
    }

    for (const tile of pair) {
      tile.kind = HIVE_KIND;
      tile.special = { type: HIVE_TYPE };
      tileView.updateTile(tile);
    }

    const [firstTile, secondTile] = pair;
    hudView.setStatus(
      "测试双光球",
      `已在 ${columnLabel(firstTile.x)} 列 ${firstTile.y + 1} 行 与 ${columnLabel(secondTile.x)} 列 ${secondTile.y + 1} 行生成相邻光球`,
    );
  }

  function onDebugBombButtonClick() {
    if (state.isProcessing || state.isLevelCompleted || state.isLevelFailed) {
      return;
    }

    const { columns, rows } = getCurrentLevelSettings();
    const target = pickRandomReplaceableTile(columns, rows);
    if (!target) {
      hudView.setStatus("测试炸弹", "当前没有可替换的普通花");
      return;
    }

    target.kind = BOMB_KIND;
    target.special = { type: BOMB_TYPE };
    tileView.updateTile(target);
    hudView.setStatus("测试炸弹", `已在 ${columnLabel(target.x)} 列 ${target.y + 1} 行生成炸弹`);
  }

  function pickRandomBoardFlowerKind() {
    const { columns, rows } = getCurrentLevelSettings();
    const kinds = new Set();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (!tile || tile.special || tile.kind.key === GRASS_KIND_KEY) {
          continue;
        }

        kinds.add(tile.kind.key);
      }
    }

    const selectableKinds = [...kinds];
    return selectableKinds[Math.floor(Math.random() * selectableKinds.length)] ?? null;
  }

  function collectTilesByKindKey(kindKey) {
    const { columns, rows } = getCurrentLevelSettings();
    const tiles = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (!tile || tile.special || tile.kind.key !== kindKey) {
          continue;
        }

        tiles.push(tile);
      }
    }

    return tiles;
  }

  function collectAllBoardTiles() {
    const { columns, rows } = getCurrentLevelSettings();
    const tiles = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (tile) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  function pickRandomReplaceableTile(columns, rows, excludedTileIds = null) {
    const flowerTiles = [];
    const fallbackTiles = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (!tile || tile.special || excludedTileIds?.has(tile.id)) {
          continue;
        }

        fallbackTiles.push(tile);
        if (tile.kind.key !== GRASS_KIND_KEY) {
          flowerTiles.push(tile);
        }
      }
    }

    const candidates = flowerTiles.length > 0 ? flowerTiles : fallbackTiles;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }

  function pickAdjacentReplaceableHivePair(columns, rows) {
    const pairs = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = state.board[y]?.[x] ?? null;
        if (!tile || tile.special) {
          continue;
        }

        const rightTile = state.board[y]?.[x + 1] ?? null;
        if (rightTile && !rightTile.special) {
          pairs.push([tile, rightTile]);
        }

        const downTile = state.board[y + 1]?.[x] ?? null;
        if (downTile && !downTile.special) {
          pairs.push([tile, downTile]);
        }
      }
    }

    if (pairs.length === 0) {
      return null;
    }

    return pairs[Math.floor(Math.random() * pairs.length)] ?? null;
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

  function findAdjacentHivePartner(tile, columns, rows) {
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
      if (neighbor && neighbor.id !== tile.id && isHiveTile(neighbor)) {
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

  function getBombTargets(tile, columns, rows) {
    const targets = [];

    for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
      const targetRow = tile.y + offsetY;
      if (targetRow < 0 || targetRow >= rows) {
        continue;
      }

      for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
        const targetColumn = tile.x + offsetX;
        if (targetColumn < 0 || targetColumn >= columns) {
          continue;
        }

        const target = state.board[targetRow]?.[targetColumn] ?? null;
        if (target) {
          targets.push(target);
        }
      }
    }

    return targets;
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
    const bombEffects = [];
    const hiveEffects = [];

    while (queuedSpecialTiles.length > 0) {
      const currentTile = queuedSpecialTiles.shift();
      if (!currentTile?.special || triggeredSpecialIds.has(currentTile.id)) {
        continue;
      }

      triggeredSpecialIds.add(currentTile.id);
      tilesById.set(currentTile.id, currentTile);

      const targets = getSpecialTargets(currentTile, columns, rows).filter((target) => !isHiveTile(target));
      for (const target of targets) {
        tilesById.set(target.id, target);
        if (!target.special) {
          claimedTargetIds.add(target.id);
        }
        if (
          target.special
          && !isHiveTile(target)
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
        continue;
      }

      if (isBombTile(currentTile)) {
        bombEffects.push({
          type: currentTile.special.type,
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
      bombEffects,
      hiveEffects,
    };
  }

  function createBoardSpecialEffects(specialTiles, columns, rows, { triggeredByTileId = null } = {}) {
    const windmillEffects = [];
    const bombEffects = [];

    for (const tile of specialTiles) {
      if (!tile?.special) {
        continue;
      }

      const targets = getSpecialTargets(tile, columns, rows).filter((target) => !isHiveTile(target));
      if (targets.length === 0) {
        continue;
      }

      if (isWindmillTile(tile)) {
        windmillEffects.push({
          type: tile.special.type,
          originTileId: tile.id,
          originX: tile.x,
          originY: tile.y,
          triggeredByTileId,
          mergedSourceTileIds: new Set(),
          targetTileIds: new Set(targets.map((target) => target.id)),
        });
        continue;
      }

      if (isBombTile(tile)) {
        bombEffects.push({
          type: tile.special.type,
          originTileId: tile.id,
          originX: tile.x,
          originY: tile.y,
          triggeredByTileId,
          targetTileIds: new Set(targets.map((target) => target.id)),
        });
      }
    }

    return { windmillEffects, bombEffects };
  }

  function getSpecialTargets(tile, columns, rows) {
    if (isBombTile(tile)) {
      return getBombTargets(tile, columns, rows);
    }

    if (isWindmillTile(tile)) {
      return getWindmillTargets(tile, columns, rows);
    }

    return [];
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

  function setMessage(message) {
    if (messageElement) {
      messageElement.textContent = message;
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
  loadingView.setMessage("加载中");

  const { results } = await preloadFirstScreenAssets();

  const failedResults = results.filter((result) => result.status !== "loaded");
  if (failedResults.length > 0) {
    console.warn("Some first-screen assets failed to preload.", failedResults);
  }

  loadingView.setMessage("加载中");
  loadingView.hide({ immediate: true });

  const app = initialize(doc);
  return app;
}

if (typeof document !== "undefined") {
  void bootstrap(document);
}

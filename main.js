const COLUMNS = 6;
const ROWS = 6;

const REMOVE_DURATION = 150;
const FALL_DURATION = 500;
const ENTRY_FALL_DURATION = 420;
const ENTRY_COLUMN_DELAY = 85;
const MAX_BOARD_GENERATION_ATTEMPTS = 200;
const MOVE_LIMIT = 10;

const TILE_KINDS = [
  { key: "amber", label: "Amber", name: "琥珀花" },
  { key: "mint", label: "Mint", name: "薄荷花" },
  { key: "sky", label: "Sky", name: "晴空花" },
  { key: "violet", label: "Violet", name: "紫藤花" },
  { key: "rose", label: "Rose", name: "玫瑰花" },
  { key: "gold", label: "Gold", name: "金花" },
];

const LEVELS = [
  {
    id: 1,
    goals: [
      { kind: "rose", count: 6 },
      { kind: "sky", count: 6 },
    ],
  },
  {
    id: 2,
    goals: [
      { kind: "gold", count: 7 },
      { kind: "mint", count: 8 },
    ],
  },
  {
    id: 3,
    goals: [
      { kind: "amber", count: 8 },
      { kind: "violet", count: 8 },
    ],
  },
];

const boardElement = document.getElementById("board");
const boardShellElement = document.querySelector(".board-shell");
const tileLayerElement = document.getElementById("tileLayer");
const levelLabelElement = document.getElementById("levelLabel");
const levelBadgeElement = document.getElementById("levelBadge");
const moveLabelElement = document.getElementById("moveLabel");
const statusTitleElement = document.getElementById("statusTitle");
const statusDetailElement = document.getElementById("statusDetail");
const goalListElement = document.getElementById("goalList");
const nextLevelButtonElement = document.getElementById("nextLevelButton");

let board = [];
let tileIdSeed = 1;
let isProcessing = false;
let isLevelCompleted = false;
let isLevelFailed = false;
let currentLevelIndex = 0;
let goalProgress = {};
let movesUsed = 0;

const tileElements = new Map();
const tilePool = [];

initialize();

function initialize() {
  fitBoardToViewport();
  renderBoardSlots();
  boardShellElement.addEventListener("click", onBoardClick);
  nextLevelButtonElement.addEventListener("click", onNextLevelButtonClick);
  window.addEventListener("resize", onViewportResize);
  void resetBoard();
}

function onViewportResize() {
  fitBoardToViewport();
  renderBoardSlots();
  refreshTilePositions();
}

function fitBoardToViewport() {
  const shellWidth = boardShellElement.clientWidth || 360;
  const shellHeight = boardShellElement.clientHeight || 640;
  const gap = shellWidth <= 360 ? 4 : 6;
  const shellInset = shellWidth <= 360 ? 8 : 12;
  const usableWidth = shellWidth - shellInset;
  const usableHeight = shellHeight - shellInset;
  const tileSizeByWidth = Math.floor((usableWidth - gap * (COLUMNS - 1)) / COLUMNS);
  const tileSizeByHeight = Math.floor((usableHeight - gap * (ROWS - 1)) / ROWS);
  const tileSize = Math.max(34, Math.min(tileSizeByWidth, tileSizeByHeight));

  boardElement.style.setProperty("--board-columns", String(COLUMNS));
  boardElement.style.setProperty("--board-rows", String(ROWS));
  boardElement.style.setProperty("--gap", `${gap}px`);
  boardElement.style.setProperty("--tile-size", `${tileSize}px`);
  tileLayerElement.style.setProperty("--gap", `${gap}px`);
  tileLayerElement.style.setProperty("--tile-size", `${tileSize}px`);
}

function renderBoardSlots() {
  boardElement.innerHTML = "";

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS; x += 1) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.style.left = `${x * getCellSpan()}px`;
      slot.style.top = `${y * getCellSpan()}px`;
      boardElement.appendChild(slot);
    }
  }
}

async function resetBoard() {
  if (isProcessing) {
    return;
  }

  prepareLevelState();
  isProcessing = true;
  syncInteractivity();
  setStatus("入场中", "按列从屏幕上方瀑布落入棋盘");

  clearAllTiles();
  board = createBoard();

  for (let x = 0; x < COLUMNS; x += 1) {
    for (let y = 0; y < ROWS; y += 1) {
      const tile = board[y][x];
      const stackIndex = ROWS - 1 - y;
      mountTileForEntry(tile, stackIndex);
    }
  }

  await animateBoardEntry();

  isProcessing = false;
  syncInteractivity();
  setStatus("就绪", "等待点击");
}

function clearAllTiles() {
  for (const element of tileElements.values()) {
    releaseTileElement(element);
  }

  tileElements.clear();
}

function createBoard() {
  for (let attempt = 0; attempt < MAX_BOARD_GENERATION_ATTEMPTS; attempt += 1) {
    const nextBoard = [];

    for (let y = 0; y < ROWS; y += 1) {
      const row = [];

      for (let x = 0; x < COLUMNS; x += 1) {
        row.push(createTile(x, y, randomKind()));
      }

      nextBoard.push(row);
    }

    if (findMatches(nextBoard).length === 0) {
      return nextBoard;
    }
  }

  return createFallbackBoard();
}

function createFallbackBoard() {
  const nextBoard = [];

  for (let y = 0; y < ROWS; y += 1) {
    const row = [];

    for (let x = 0; x < COLUMNS; x += 1) {
      const kind = TILE_KINDS[(x + y * 2) % TILE_KINDS.length];
      row.push(createTile(x, y, kind));
    }

    nextBoard.push(row);
  }

  return nextBoard;
}

function createTile(x, y, kind) {
  return {
    id: tileIdSeed++,
    x,
    y,
    kind,
  };
}

function randomKind() {
  return TILE_KINDS[Math.floor(Math.random() * TILE_KINDS.length)];
}

function onBoardClick(event) {
  if (isProcessing || isLevelCompleted || isLevelFailed) {
    return;
  }

  const tileElement = event.target.closest(".tile");
  if (!tileElement || !tileLayerElement.contains(tileElement)) {
    return;
  }

  const tile = findTileById(Number(tileElement.dataset.tileId));
  if (!tile) {
    return;
  }

  void processTurn(tile);
}

async function processTurn(tile) {
  isProcessing = true;
  movesUsed += 1;
  syncInteractivity();
  setStatus("结算中", `删除 ${columnLabel(tile.x)} 列 ${tile.y + 1} 行，还剩 ${getRemainingMoves()} 步`);

  const initialResult = applyRemovalsAndCollapse([tile]);
  recordRemovedTiles(initialResult.removedTiles);
  await animateResolution(initialResult);

  const cascadeCount = await resolveBoardMatches("本次");

  if (isCurrentLevelComplete()) {
    isLevelCompleted = true;
    isProcessing = false;
    syncInteractivity();
    setStatus("关卡完成", `${getCurrentLevelLabel()} 已达成全部目标`);
    return;
  }

  if (movesUsed >= MOVE_LIMIT) {
    isLevelFailed = true;
    isProcessing = false;
    syncInteractivity();
    setStatus("步数用尽", `${getCurrentLevelLabel()} 未完成目标，点击重试本关`);
    return;
  }

  isProcessing = false;
  syncInteractivity();

  if (cascadeCount > 0) {
    setStatus("就绪", `本次触发 ${cascadeCount} 次连锁`);
  } else {
    setStatus("就绪", "本次未形成连通块消除");
  }
}

async function resolveBoardMatches(contextLabel) {
  let cascadeCount = 0;

  while (true) {
    const matchedTiles = findMatches();
    if (matchedTiles.length === 0) {
      break;
    }

    cascadeCount += 1;
    setStatus("连锁中", `${contextLabel}第 ${cascadeCount} 次消除 ${matchedTiles.length} 个`);

    const result = applyRemovalsAndCollapse(matchedTiles);
    recordRemovedTiles(result.removedTiles);
    await animateResolution(result);
  }

  return cascadeCount;
}

function applyRemovalsAndCollapse(tilesToRemove) {
  const removedTiles = [];

  for (const tile of tilesToRemove) {
    const currentTile = board[tile.y]?.[tile.x] ?? null;
    if (!currentTile || currentTile.id !== tile.id) {
      continue;
    }

    board[tile.y][tile.x] = null;
    removedTiles.push(currentTile);
  }

  const collapseResult = collapseBoard();

  return {
    removedTiles,
    dropped: collapseResult.dropped,
    spawned: collapseResult.spawned,
  };
}

function collapseBoard() {
  const dropped = [];
  const spawned = [];

  for (let x = 0; x < COLUMNS; x += 1) {
    let writeRow = ROWS - 1;

    for (let readRow = ROWS - 1; readRow >= 0; readRow -= 1) {
      const tile = board[readRow][x];
      if (!tile) {
        continue;
      }

      if (readRow !== writeRow) {
        board[writeRow][x] = tile;
        board[readRow][x] = null;
        dropped.push({ tile, fromY: readRow, toY: writeRow });
        tile.y = writeRow;
      }

      writeRow -= 1;
    }

    for (let row = writeRow; row >= 0; row -= 1) {
      const spawnIndex = writeRow - row;
      const tile = createTile(x, row, randomKind());
      board[row][x] = tile;
      spawned.push({ tile, fromRow: -1 - spawnIndex, toRow: row });
    }
  }

  return { dropped, spawned };
}

function findMatches(boardState = board) {
  const visited = new Set();
  const matches = new Map();

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS; x += 1) {
      const tile = boardState[y][x];
      if (!tile) {
        continue;
      }

      const key = toCellKey(x, y);
      if (visited.has(key)) {
        continue;
      }

      const group = collectConnectedGroup(boardState, x, y, visited);
      if (group.length < 3) {
        continue;
      }

      for (const groupTile of group) {
        matches.set(groupTile.id, groupTile);
      }
    }
  }

  return Array.from(matches.values());
}

function collectConnectedGroup(boardState, startX, startY, visited) {
  const startTile = boardState[startY]?.[startX] ?? null;
  if (!startTile) {
    return [];
  }

  const stack = [{ x: startX, y: startY }];
  const group = [];

  while (stack.length > 0) {
    const cell = stack.pop();
    const key = toCellKey(cell.x, cell.y);
    if (visited.has(key)) {
      continue;
    }

    const tile = boardState[cell.y]?.[cell.x] ?? null;
    if (!tile || tile.kind.key !== startTile.kind.key) {
      continue;
    }

    visited.add(key);
    group.push(tile);

    for (const neighbor of getOrthogonalNeighbors(cell.x, cell.y)) {
      if (!visited.has(toCellKey(neighbor.x, neighbor.y))) {
        stack.push(neighbor);
      }
    }
  }

  return group;
}

function getOrthogonalNeighbors(x, y) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((cell) => cell.x >= 0 && cell.x < COLUMNS && cell.y >= 0 && cell.y < ROWS);
}

async function animateResolution(result) {
  animateRemoval(result.removedTiles);
  await wait(REMOVE_DURATION);

  for (const tile of result.removedTiles) {
    unmountTile(tile.id);
  }

  animateDrops(result.dropped, result.spawned);
  await wait(FALL_DURATION);
}

function animateRemoval(tiles) {
  for (const tile of tiles) {
    const element = tileElements.get(tile.id);
    if (element) {
      element.classList.add("is-removing");
    }
  }
}

function animateDrops(dropped, spawned) {
  for (const move of dropped) {
    const element = tileElements.get(move.tile.id);
    if (element) {
      setTileBoardPosition(element, move.tile.x, move.toY);
    }
  }

  for (const spawn of spawned) {
    const element = acquireTileElement();
    decorateTileElement(element, spawn.tile);
    tileElements.set(spawn.tile.id, element);
    tileLayerElement.appendChild(element);
    placeTileAtBoardRowWithoutAnimation(element, spawn.tile.x, spawn.fromRow);
    element.classList.add("is-spawning");
    void element.offsetHeight;
    element.classList.remove("no-transition");
    setTileBoardPosition(element, spawn.tile.x, spawn.toRow);
    requestAnimationFrame(() => {
      element.classList.remove("is-spawning");
    });
  }
}

async function animateBoardEntry() {
  for (const element of tileElements.values()) {
    void element.offsetHeight;
  }

  for (let x = 0; x < COLUMNS; x += 1) {
    for (let y = 0; y < ROWS; y += 1) {
      const tile = board[y][x];
      const element = tileElements.get(tile.id);
      if (!element) {
        continue;
      }

      element.classList.add("is-entering");
      element.style.transitionDelay = `${x * ENTRY_COLUMN_DELAY}ms`;
      element.classList.remove("no-transition");
    }
  }

  void tileLayerElement.offsetHeight;

  for (let x = 0; x < COLUMNS; x += 1) {
    for (let y = 0; y < ROWS; y += 1) {
      const tile = board[y][x];
      const element = tileElements.get(tile.id);
      if (element) {
        setTileBoardPosition(element, tile.x, tile.y);
      }
    }
  }

  await wait(ENTRY_FALL_DURATION + ENTRY_COLUMN_DELAY * (COLUMNS - 1));

  for (const element of tileElements.values()) {
    element.classList.remove("is-entering");
    element.style.removeProperty("transition-delay");
  }
}

function mountTileForEntry(tile, stackIndex) {
  const element = acquireTileElement();
  decorateTileElement(element, tile);
  tileElements.set(tile.id, element);
  tileLayerElement.appendChild(element);

  const start = getEntryStartPosition(tile.x, stackIndex);
  placeTileWithoutAnimation(element, start.left, start.top);
}

function getEntryStartPosition(column, stackIndex) {
  const metrics = getBoardMetrics();

  return {
    left: metrics.left + column * metrics.span,
    top: -((stackIndex + 1) * metrics.span),
  };
}

function setTileBoardPosition(element, column, row) {
  const metrics = getBoardMetrics();
  setTileStagePosition(
    element,
    metrics.left + column * metrics.span,
    metrics.top + row * metrics.span,
  );
}

function setTileStagePosition(element, left, top) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

function placeTileWithoutAnimation(element, left, top) {
  element.classList.add("no-transition");
  setTileStagePosition(element, left, top);
}

function placeTileAtBoardRowWithoutAnimation(element, column, row) {
  const metrics = getBoardMetrics();
  placeTileWithoutAnimation(
    element,
    metrics.left + column * metrics.span,
    metrics.top + row * metrics.span,
  );
}

function getBoardMetrics() {
  const boardRect = boardElement.getBoundingClientRect();
  const shellRect = boardShellElement.getBoundingClientRect();
  const style = getComputedStyle(boardElement);
  const tileSize = parseFloat(style.getPropertyValue("--tile-size")) || 52;
  const gap = parseFloat(style.getPropertyValue("--gap")) || 6;

  return {
    left: boardRect.left - shellRect.left,
    top: boardRect.top - shellRect.top,
    tileSize,
    gap,
    span: tileSize + gap,
  };
}

function getCellSpan() {
  return getBoardMetrics().span;
}

function refreshTilePositions() {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS; x += 1) {
      const tile = board[y][x];
      if (!tile) {
        continue;
      }

      const element = tileElements.get(tile.id);
      if (element) {
        setTileBoardPosition(element, x, y);
      }
    }
  }
}

function findTileById(tileId) {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS; x += 1) {
      const tile = board[y][x];
      if (tile && tile.id === tileId) {
        return tile;
      }
    }
  }

  return null;
}

function unmountTile(tileId) {
  const element = tileElements.get(tileId);
  if (!element) {
    return;
  }

  tileElements.delete(tileId);
  releaseTileElement(element);
}

function acquireTileElement() {
  return tilePool.pop() || document.createElement("button");
}

function releaseTileElement(element) {
  element.remove();
  element.className = "tile";
  element.textContent = "";
  element.disabled = false;
  element.style.removeProperty("left");
  element.style.removeProperty("top");
  element.style.removeProperty("transition-delay");
  delete element.dataset.tileId;
  tilePool.push(element);
}

function decorateTileElement(element, tile) {
  element.type = "button";
  element.className = `tile tile--${tile.kind.key}`;
  element.textContent = "";
  element.dataset.tileId = String(tile.id);
  element.disabled = isProcessing || isLevelCompleted || isLevelFailed;
  element.setAttribute("aria-label", `${tile.kind.name}，第 ${tile.x + 1} 列，第 ${tile.y + 1} 行`);
}

function syncInteractivity() {
  for (const element of tileElements.values()) {
    element.disabled = isProcessing || isLevelCompleted || isLevelFailed;
  }
}

function onNextLevelButtonClick() {
  if (isProcessing || (!isLevelCompleted && !isLevelFailed)) {
    return;
  }

  if (isLevelCompleted) {
    currentLevelIndex = currentLevelIndex < LEVELS.length - 1 ? currentLevelIndex + 1 : 0;
  }

  void resetBoard();
}

function prepareLevelState() {
  isLevelCompleted = false;
  isLevelFailed = false;
  goalProgress = Object.fromEntries(getCurrentLevel().goals.map((goal) => [goal.kind, 0]));
  movesUsed = 0;
  renderLevelHud();
}

function recordRemovedTiles(removedTiles) {
  let hasProgressUpdate = false;

  for (const tile of removedTiles) {
    if (!(tile.kind.key in goalProgress)) {
      continue;
    }

    goalProgress[tile.kind.key] += 1;
    hasProgressUpdate = true;
  }

  if (hasProgressUpdate) {
    renderLevelHud();
  }
}

function renderLevelHud() {
  levelLabelElement.textContent = getCurrentLevelLabel();
  levelBadgeElement.textContent = String(getCurrentLevel().id);
  moveLabelElement.textContent = String(getRemainingMoves());
  renderGoalList();
  nextLevelButtonElement.hidden = !isLevelCompleted && !isLevelFailed;
  nextLevelButtonElement.textContent = getActionButtonLabel();
}

function renderGoalList() {
  goalListElement.innerHTML = "";

  for (const goal of getCurrentLevel().goals) {
    const item = document.createElement("li");
    const progress = Math.min(goalProgress[goal.kind] ?? 0, goal.count);
    const remaining = Math.max(goal.count - progress, 0);
    const isComplete = remaining === 0;
    const kind = getTileKind(goal.kind);

    item.className = isComplete ? "goal-item is-complete" : "goal-item";
    item.setAttribute("aria-label", `${kind.name}，剩余 ${remaining}，目标 ${goal.count}`);

    const swatch = document.createElement("span");
    swatch.className = `goal-swatch goal-swatch--${goal.kind}`;
    swatch.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "goal-copy";

    const name = document.createElement("span");
    name.className = "goal-name";
    name.textContent = kind.name;

    const count = document.createElement("span");
    count.className = "goal-progress";
    count.textContent = String(remaining);

    copy.append(name, count);
    item.append(swatch, copy);
    goalListElement.appendChild(item);
  }
}

function isCurrentLevelComplete() {
  return getCurrentLevel().goals.every((goal) => (goalProgress[goal.kind] ?? 0) >= goal.count);
}

function getCurrentLevel() {
  return LEVELS[currentLevelIndex] ?? LEVELS[0];
}

function getCurrentLevelLabel() {
  return `第 ${getCurrentLevel().id} 关`;
}

function getRemainingMoves() {
  return Math.max(MOVE_LIMIT - movesUsed, 0);
}

function getActionButtonLabel() {
  if (isLevelFailed) {
    return "重试本关";
  }

  return currentLevelIndex < LEVELS.length - 1 ? "下一关" : "重新开始";
}

function getTileKind(kindKey) {
  return TILE_KINDS.find((kind) => kind.key === kindKey) ?? TILE_KINDS[0];
}

function toCellKey(x, y) {
  return `${x},${y}`;
}

function columnLabel(index) {
  return String.fromCharCode(65 + index);
}

function setStatus(title, detail) {
  if (statusTitleElement) {
    statusTitleElement.textContent = title;
  }

  if (statusDetailElement) {
    statusDetailElement.textContent = detail;
  }

  renderLevelHud();
  document.title = detail ? `${title} - Grid Fall Prototype` : "Grid Fall Prototype";
}

function wait(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

import { findMatches } from "./match.js";

const FOUR_MATCH_SIZE = 4;
const FIVE_MATCH_SIZE = 5;
const WINDMILL_KIND = { key: "windmill", label: "Windmill", name: "风车" };
const HIVE_KIND = { key: "hive", label: "Lightball", name: "光球" };
const BOMB_KIND = { key: "bomb", label: "Bomb", name: "炸弹" };
const WINDMILL_TYPE = "windmill";
const HIVE_TYPE = "hive";
const BOMB_TYPE = "bomb";
const DEFAULT_SPAWN_DIRECT_MATCH_CHANCE = 0.3;

export function createTile(state, x, y, kind) {
  return {
    id: state.tileIdSeed++,
    x,
    y,
    kind,
  };
}

export function randomKind(tileKinds) {
  return tileKinds[Math.floor(Math.random() * tileKinds.length)];
}

function pickSpawnKind(board, x, y, columns, rows, tileKinds, directMatchChance = 0) {
  if (Math.random() < directMatchChance) {
    return randomKind(tileKinds);
  }

  const startIndex = Math.floor(Math.random() * tileKinds.length);

  for (let offset = 0; offset < tileKinds.length; offset += 1) {
    const kind = tileKinds[(startIndex + offset) % tileKinds.length];
    if (!wouldCreateMatch(board, x, y, columns, rows, kind.key)) {
      return kind;
    }
  }

  return tileKinds[startIndex] ?? randomKind(tileKinds);
}

function wouldCreateMatch(board, startX, startY, columns, rows, kindKey) {
  const visited = new Set();
  const stack = [{ x: startX, y: startY }];
  let groupSize = 0;

  while (stack.length > 0) {
    const cell = stack.pop();
    const key = `${cell.x},${cell.y}`;
    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    if (cell.x === startX && cell.y === startY) {
      groupSize += 1;
    } else {
      const tile = board[cell.y]?.[cell.x] ?? null;
      if (!tile || tile.special || tile.kind.key !== kindKey) {
        continue;
      }

      groupSize += 1;
    }

    if (groupSize >= 3) {
      return true;
    }

    if (cell.x > 0) {
      stack.push({ x: cell.x - 1, y: cell.y });
    }
    if (cell.x + 1 < columns) {
      stack.push({ x: cell.x + 1, y: cell.y });
    }
    if (cell.y > 0) {
      stack.push({ x: cell.x, y: cell.y - 1 });
    }
    if (cell.y + 1 < rows) {
      stack.push({ x: cell.x, y: cell.y + 1 });
    }
  }

  return false;
}

export function createBoard({
  state,
  columns,
  rows,
  tileKinds,
  maxAttempts,
  isBlocked = () => false,
  isHole = () => false,
}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const nextBoard = Array.from({ length: rows }, () => Array(columns).fill(null));

    collapseBoard({ board: nextBoard, columns, rows, state, tileKinds, isBlocked, isHole });

    if (findMatches(nextBoard, columns, rows).length === 0) {
      return nextBoard;
    }
  }

  return createFallbackBoard({ state, columns, rows, tileKinds, isBlocked, isHole });
}

export function createFixedBoard({ state, layout, tileKindMap, isBlocked = () => false, isHole = () => false }) {
  const nextBoard = [];
  // 定义数字到 Key 的映射
  const numToKey = {
    0: "grass",  // 杂草
    1: "amber",  // 橙色
    2: "mint",   // 粉色
    3: "sky",    // 黄色
    4: "violet", // 红色
    5: "rose",   // 蓝色
    6: "gold",   // 紫色
    7: "green"   // 绿色
  };

  for (let y = 0; y < layout.length; y += 1) {
    const row = [];
    for (let x = 0; x < layout[y].length; x += 1) {
      if (isHole(x, y) || isBlocked(x, y)) {
        // 镂空格不生成棋子，保持 null
        row.push(null);
        continue;
      }

      let kindKey = layout[y][x];
      // 如果是数字，转换成字符串 Key
      if (typeof kindKey === "number") {
        kindKey = numToKey[kindKey] ?? "rose";
      }
      
      const kind = tileKindMap[kindKey] ?? Object.values(tileKindMap)[0];
      row.push(createTile(state, x, y, kind));
    }
    nextBoard.push(row);
  }

  return nextBoard;
}

function createFallbackBoard({
  state,
  columns,
  rows,
  tileKinds,
  isBlocked = () => false,
  isHole = () => false,
}) {
  const nextBoard = Array.from({ length: rows }, () => Array(columns).fill(null));

  collapseBoard({ board: nextBoard, columns, rows, state, tileKinds, isBlocked, isHole });

  return nextBoard;
}

export function applyRemovalsAndCollapse({
  board,
  tilesToRemove,
  tileGroups,
  columns,
  rows,
  state,
  tileKinds,
  specialCreationContext = null,
  spawnDirectMatchChance = DEFAULT_SPAWN_DIRECT_MATCH_CHANCE,
  applyObstacleDamage = null,
  isBlocked = () => false,
  isHole = () => false,
}) {
  const removedTiles = [];
  const removedTileGroups = [];
  const createdSpecialTiles = [];
  const triggeredSpecialTiles = [];
  const groupsToRemove = tileGroups ?? [tilesToRemove];

  for (const group of groupsToRemove) {
    const removedGroup = [];
    const specialSourceTile = pickMatchSpecialTile(group, specialCreationContext);

    for (const tile of group) {
      const currentTile = board[tile.y]?.[tile.x] ?? null;
      if (!currentTile || currentTile.id !== tile.id) {
        continue;
      }

      board[tile.y][tile.x] = null;
      removedTiles.push(currentTile);
      removedGroup.push(currentTile);
      if (currentTile.special) {
        triggeredSpecialTiles.push(currentTile);
      }
    }

    if (removedGroup.length > 0) {
      removedTileGroups.push(removedGroup);
    }

    if (specialSourceTile && removedGroup.length >= FIVE_MATCH_SIZE) {
      const specialTile = createTile(state, specialSourceTile.x, specialSourceTile.y, BOMB_KIND);
      specialTile.special = { type: BOMB_TYPE };
      board[specialTile.y][specialTile.x] = specialTile;
      createdSpecialTiles.push({ tile: specialTile, fromRow: specialSourceTile.y });
    } else if (specialSourceTile && removedGroup.length === FOUR_MATCH_SIZE) {
      const specialTile = createTile(state, specialSourceTile.x, specialSourceTile.y, WINDMILL_KIND);
      specialTile.special = { type: WINDMILL_TYPE };
      board[specialTile.y][specialTile.x] = specialTile;
      createdSpecialTiles.push({ tile: specialTile, fromRow: specialSourceTile.y });
    }
  }

  const obstacleResult = applyObstacleDamage?.(removedTiles) ?? {
    damagedBricks: [],
    brokenBricks: [],
    damagedCrates: [],
    brokenCrates: [],
  };

  const collapseResult = collapseBoard({
    board,
    columns,
    rows,
    state,
    tileKinds,
    spawnDirectMatchChance,
    isBlocked,
    isHole,
  });

  return {
    removedTiles,
    removedTileGroups,
    createdSpecialTiles,
    triggeredSpecialTiles,
    damagedBricks: obstacleResult.damagedBricks,
    brokenBricks: obstacleResult.brokenBricks,
    damagedCrates: obstacleResult.damagedCrates ?? [],
    brokenCrates: obstacleResult.brokenCrates ?? [],
    dropped: collapseResult.dropped,
    spawned: collapseResult.spawned,
  };
}

function pickMatchSpecialTile(group, specialCreationContext) {
  if (specialCreationContext?.allowSpecialCreation === false) {
    return null;
  }

  if (group.length < FOUR_MATCH_SIZE || group.some((tile) => tile.special)) {
    return null;
  }

  const movedTileIds = specialCreationContext?.movedTileIds;
  const movedCandidates = movedTileIds
    ? group.filter((tile) => movedTileIds.has(tile.id))
    : [];

  if (movedCandidates.length > 0) {
    return pickNearestTile(movedCandidates, specialCreationContext?.clickedCell);
  }

  return pickStableTile(group);
}

function pickNearestTile(group, cell) {
  if (!cell) {
    return pickStableTile(group);
  }

  return [...group].sort((a, b) => {
    const distanceA = Math.abs(a.x - cell.x) + Math.abs(a.y - cell.y);
    const distanceB = Math.abs(b.x - cell.x) + Math.abs(b.y - cell.y);
    return distanceA - distanceB || b.y - a.y || a.x - b.x;
  })[0];
}

function pickStableTile(group) {
  const centerX = group.reduce((sum, tile) => sum + tile.x, 0) / group.length;

  return [...group].sort((a, b) => {
    if (a.y !== b.y) {
      return b.y - a.y;
    }

    return Math.abs(a.x - centerX) - Math.abs(b.x - centerX);
  })[0];
}

function collapseBoard({
  board,
  columns,
  rows,
  state,
  tileKinds,
  spawnDirectMatchChance = 0,
  isBlocked = () => false,
  isHole = () => false,
}) {
  const droppedById = new Map();
  const spawnedById = new Map();
  const canOccupy = (x, y) => x >= 0 && x < columns && y >= 0 && y < rows && !isHole(x, y) && !isBlocked(x, y);

  let moved = true;
  let collapseStep = 0;
  while (moved) {
    moved = false;
    collapseStep += 1;

    for (let y = rows - 2; y >= 0; y -= 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = board[y]?.[x] ?? null;
        if (!tile) {
          continue;
        }

        const nextPosition = findNextTilePosition(board, x, y, canOccupy, isBlocked, isHole);
        if (!nextPosition || (nextPosition.x === x && nextPosition.y === y)) {
          continue;
        }

        board[y][x] = null;
        board[nextPosition.y][nextPosition.x] = tile;

        const existingSpawn = spawnedById.get(tile.id);
        if (existingSpawn) {
          existingSpawn.toX = nextPosition.x;
          existingSpawn.toRow = nextPosition.y;
          existingSpawn.path.push({ x: nextPosition.x, y: nextPosition.y, step: collapseStep });
        } else {
          const existingMove = droppedById.get(tile.id);
          if (existingMove) {
            existingMove.toX = nextPosition.x;
            existingMove.toY = nextPosition.y;
            existingMove.path.push({ x: nextPosition.x, y: nextPosition.y, step: collapseStep });
          } else {
            droppedById.set(tile.id, {
              tile,
              fromX: x,
              fromY: y,
              toX: nextPosition.x,
              toY: nextPosition.y,
              path: [{ x: nextPosition.x, y: nextPosition.y, step: collapseStep }],
            });
          }
        }

        tile.x = nextPosition.x;
        tile.y = nextPosition.y;
        moved = true;
      }
    }

    const spawnCells = findSpawnCells(board, columns, rows, canOccupy, isBlocked, isHole);
    for (const cell of spawnCells) {
      const tile = createTile(
        state,
        cell.x,
        cell.y,
        pickSpawnKind(board, cell.x, cell.y, columns, rows, tileKinds, spawnDirectMatchChance),
      );
      board[cell.y][cell.x] = tile;
      spawnedById.set(tile.id, {
        tile,
        fromRow: -1,
        toX: cell.x,
        toRow: cell.y,
        path: [{ x: cell.x, y: cell.y, step: collapseStep }],
      });
      moved = true;
    }
  }

  return { dropped: [...droppedById.values()], spawned: [...spawnedById.values()] };
}

function findSpawnCells(board, columns, rows, canOccupy, isBlocked, isHole) {
  const spawnCells = [];

  for (let x = 0; x < columns; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      if (isBlocked(x, y)) {
        break;
      }

      if (isHole(x, y)) {
        continue;
      }

      if (canOccupy(x, y) && !board[y]?.[x]) {
        spawnCells.push({ x, y });
      }

      break;
    }
  }

  return spawnCells;
}

function findNextTilePosition(board, x, y, canOccupy, isBlocked, isHole) {
  const verticalY = findVerticalLandingY(board, x, y, isBlocked, isHole);
  if (verticalY > y) {
    return { x, y: verticalY };
  }

  const slideTarget = findDiagonalSlideTarget(board, x, y, canOccupy, isBlocked, isHole);
  if (slideTarget) {
    return slideTarget;
  }

  return { x, y };
}

function findVerticalLandingY(board, x, startY, isBlocked, isHole) {
  let landingY = startY;

  for (let y = startY + 1; y < board.length; y += 1) {
    if (isBlocked(x, y)) {
      break;
    }

    if (board[y]?.[x]) {
      break;
    }

    if (!isHole(x, y)) {
      landingY = y;
    }
  }

  return landingY;
}

function findDiagonalSlideTarget(board, x, y, canOccupy, isBlocked, isHole) {
  if (y + 1 >= board.length) {
    return null;
  }

  const candidateXs = (x + y) % 2 === 0 ? [x - 1, x + 1] : [x + 1, x - 1];
  for (const targetX of candidateXs) {
    const targetY = y + 1;
    if (!canOccupy(targetX, targetY) || board[targetY]?.[targetX]) {
      continue;
    }

    if (canCellFillVertically(board, targetX, targetY, isBlocked, isHole)) {
      continue;
    }

    return { x: targetX, y: targetY };
  }

  return null;
}

function canCellFillVertically(board, x, y, isBlocked, isHole) {
  for (let scanY = y - 1; scanY >= 0; scanY -= 1) {
    if (isBlocked(x, scanY)) {
      return false;
    }

    if (isHole(x, scanY)) {
      continue;
    }

    if (board[scanY]?.[x]) {
      return true;
    }
  }

  return true;
}

function getPredecessorCells(board, x, y, canOccupy, isBlocked, isHole) {
  if (y <= 0) {
    return [];
  }

  const canTraverse = (cellX, cellY) => cellX >= 0 && cellX < board[0].length && cellY >= 0 && cellY < board.length && !isBlocked(cellX, cellY);
  const diagonalCandidates = (x + y) % 2 === 0
    ? [{ x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 }]
    : [{ x: x + 1, y: y - 1 }, { x: x - 1, y: y - 1 }];

  const candidates = [];

  if (canTraverse(x, y - 1)) {
    candidates.push({ x, y: y - 1 });
  }

  // A hole is a vertical shaft: tiles should pass straight through it instead
  // of treating it like a reason to start diagonal sliding.
  if (isHole(x, y)) {
    return candidates;
  }

  if (isVerticalPathOpenToTop(x, y, isBlocked, isHole)) {
    return candidates;
  }

  for (const cell of diagonalCandidates) {
    if (!canOccupy(cell.x, cell.y)) {
      continue;
    }

    // Holes should behave like transparent vertical shafts, not as a reason to
    // start diagonal sliding into a neighboring lane.
    if (isHole(cell.x, y)) {
      continue;
    }

    // A tile only slides diagonally after it has already fallen as far as it
    // can in its own column. If it can keep falling straight, do not slide.
    if (canContinueVertical(board, cell.x, y, canOccupy, isBlocked, isHole)) {
      continue;
    }

    candidates.push(cell);
  }

  return candidates;
}

function findSourceCell(board, targetX, targetY, canOccupy, isBlocked, isHole) {
  const verticalSource = findVerticalSourceCell(board, targetX, targetY, isBlocked, isHole);
  if (verticalSource) {
    return verticalSource;
  }

  if (isVerticalPathOpenToTop(targetX, targetY, isBlocked, isHole)) {
    return null;
  }

  const diagonalCandidates = getPredecessorCells(board, targetX, targetY, canOccupy, isBlocked, isHole)
    .filter((cell) => cell.x !== targetX);

  for (const cell of diagonalCandidates) {
    const tile = board[cell.y]?.[cell.x] ?? null;
    if (tile) {
      return cell;
    }
  }

  return null;
}

function findVerticalSourceCell(board, x, targetY, isBlocked, isHole) {
  for (let y = targetY - 1; y >= 0; y -= 1) {
    if (isBlocked(x, y)) {
      return null;
    }

    if (isHole(x, y)) {
      continue;
    }

    if (board[y]?.[x]) {
      return { x, y };
    }
  }

  return null;
}

function hasVerticalSource(board, x, y, canOccupy, isBlocked, isHole) {
  if (!canOccupy(x, y)) {
    return false;
  }

  for (let scanY = y - 1; scanY >= 0; scanY -= 1) {
    if (isBlocked(x, scanY)) {
      return false;
    }

    if (isHole(x, scanY)) {
      continue;
    }

    if (board[scanY]?.[x]) {
      return true;
    }
  }

  return false;
}

function isVerticalPathOpenToTop(x, y, isBlocked, isHole) {
  for (let scanY = y - 1; scanY >= 0; scanY -= 1) {
    if (isBlocked(x, scanY)) {
      return false;
    }

    if (isHole(x, scanY)) {
      continue;
    }
  }

  return true;
}

function canContinueVertical(board, x, y, canOccupy, isBlocked, isHole) {
  if (y >= board.length) {
    return false;
  }

  if (isBlocked(x, y)) {
    return false;
  }

  if (isHole(x, y)) {
    return true;
  }

  return canOccupy(x, y) && !board[y]?.[x];
}

function isReachableFromTop(board, targetX, targetY, canOccupy, isBlocked, isHole) {
  if (!canOccupy(targetX, targetY)) {
    return false;
  }

  const queue = [{ x: targetX, y: targetY }];
  const visited = new Set([`${targetX},${targetY}`]);

  while (queue.length > 0) {
    const cell = queue.shift();
    if (cell.y === 0) {
      return true;
    }

    for (const predecessor of getPredecessorCells(board, cell.x, cell.y, canOccupy, isBlocked, isHole)) {
      const key = `${predecessor.x},${predecessor.y}`;
      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push(predecessor);
    }
  }

  return false;
}

export function findTileById({ board, columns, rows, tileId }) {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const tile = board[y]?.[x] ?? null;
      if (tile && tile.id === tileId) {
        return tile;
      }
    }
  }

  return null;
}

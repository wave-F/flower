import { findMatches } from "./match.js";

const FOUR_MATCH_SIZE = 4;
const FIVE_MATCH_SIZE = 5;
const WINDMILL_KIND = { key: "windmill", label: "Windmill", name: "风车" };
const HIVE_KIND = { key: "hive", label: "Hive", name: "蜂巢" };
const WINDMILL_TYPE = "windmill";
const HIVE_TYPE = "hive";

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
      const specialTile = createTile(state, specialSourceTile.x, specialSourceTile.y, HIVE_KIND);
      specialTile.special = { type: HIVE_TYPE };
      board[specialTile.y][specialTile.x] = specialTile;
      createdSpecialTiles.push({ tile: specialTile, fromRow: specialSourceTile.y });
    } else if (specialSourceTile && removedGroup.length === FOUR_MATCH_SIZE) {
      const specialTile = createTile(state, specialSourceTile.x, specialSourceTile.y, WINDMILL_KIND);
      specialTile.special = { type: WINDMILL_TYPE };
      board[specialTile.y][specialTile.x] = specialTile;
      createdSpecialTiles.push({ tile: specialTile, fromRow: specialSourceTile.y });
    }
  }

  const obstacleResult = applyObstacleDamage?.(removedTiles) ?? { damagedBricks: [], brokenBricks: [] };
  const collapseResult = collapseBoard({ board, columns, rows, state, tileKinds, isBlocked, isHole });

  return {
    removedTiles,
    removedTileGroups,
    createdSpecialTiles,
    triggeredSpecialTiles,
    damagedBricks: obstacleResult.damagedBricks,
    brokenBricks: obstacleResult.brokenBricks,
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

function collapseBoard({ board, columns, rows, state, tileKinds, isBlocked = () => false, isHole = () => false }) {
  const dropped = [];
  const spawned = [];
  const canOccupy = (x, y) => x >= 0 && x < columns && y >= 0 && y < rows && !isHole(x, y) && !isBlocked(x, y);

  for (let y = rows - 1; y >= 0; y -= 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!canOccupy(x, y) || board[y][x]) {
        continue;
      }

      const source = findSourceCell(board, x, y, canOccupy);
      if (source) {
        const tile = board[source.y][source.x];
        board[source.y][source.x] = null;
        board[y][x] = tile;
        dropped.push({ tile, fromX: source.x, fromY: source.y, toX: x, toY: y });
        tile.x = x;
        tile.y = y;
        continue;
      }

      if (isReachableFromTop(x, y, canOccupy)) {
        const tile = createTile(state, x, y, randomKind(tileKinds));
        board[y][x] = tile;
        spawned.push({ tile, fromRow: -1, toRow: y });
      }
    }
  }

  return { dropped, spawned };
}

function getPredecessorCells(x, y, canOccupy) {
  if (y <= 0) {
    return [];
  }

  const diagonalCandidates = (x + y) % 2 === 0
    ? [{ x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 }]
    : [{ x: x + 1, y: y - 1 }, { x: x - 1, y: y - 1 }];

  const candidates = [{ x, y: y - 1 }, ...diagonalCandidates];
  return candidates.filter((cell) => canOccupy(cell.x, cell.y));
}

function findSourceCell(board, targetX, targetY, canOccupy) {
  const queue = getPredecessorCells(targetX, targetY, canOccupy).map((cell) => ({ ...cell }));
  const visited = new Set(queue.map((cell) => `${cell.x},${cell.y}`));

  while (queue.length > 0) {
    const cell = queue.shift();
    const tile = board[cell.y]?.[cell.x] ?? null;
    if (tile) {
      return cell;
    }

    for (const predecessor of getPredecessorCells(cell.x, cell.y, canOccupy)) {
      const key = `${predecessor.x},${predecessor.y}`;
      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push(predecessor);
    }
  }

  return null;
}

function isReachableFromTop(targetX, targetY, canOccupy) {
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

    for (const predecessor of getPredecessorCells(cell.x, cell.y, canOccupy)) {
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

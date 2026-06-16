import { findMatches } from "./match.js";

const FOUR_MATCH_SIZE = 4;
const FIVE_MATCH_SIZE = 5;
const WINDMILL_KIND = { key: "windmill", label: "Windmill", name: "风车" };
const HIVE_KIND = { key: "hive", label: "Lightball", name: "光球" };
const BOMB_KIND = { key: "bomb", label: "Bomb", name: "炸弹" };
const WINDMILL_TYPE = "windmill";
const HIVE_TYPE = "hive";
const BOMB_TYPE = "bomb";

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

export function createBoard({ state, columns, rows, tileKinds, maxAttempts, isHole = () => false }) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const nextBoard = [];

    for (let y = 0; y < rows; y += 1) {
      const row = [];

      for (let x = 0; x < columns; x += 1) {
        row.push(isHole(x, y) ? null : createTile(state, x, y, randomKind(tileKinds)));
      }

      nextBoard.push(row);
    }

    if (findMatches(nextBoard, columns, rows).length === 0) {
      return nextBoard;
    }
  }

  return createFallbackBoard({ state, columns, rows, tileKinds, isHole });
}

export function createFixedBoard({ state, layout, tileKindMap, isHole = () => false }) {
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
      if (isHole(x, y)) {
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

function createFallbackBoard({ state, columns, rows, tileKinds, isHole = () => false }) {
  const nextBoard = [];

  for (let y = 0; y < rows; y += 1) {
    const row = [];

    for (let x = 0; x < columns; x += 1) {
      if (isHole(x, y)) {
        row.push(null);
        continue;
      }

      const kind = tileKinds[(x + y * 2) % tileKinds.length];
      row.push(createTile(state, x, y, kind));
    }

    nextBoard.push(row);
  }

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

  const collapseResult = collapseBoard({ board, columns, rows, state, tileKinds, isHole });

  return {
    removedTiles,
    removedTileGroups,
    createdSpecialTiles,
    triggeredSpecialTiles,
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

function collapseBoard({ board, columns, rows, state, tileKinds, isHole = () => false }) {
  const dropped = [];
  const spawned = [];

  for (let x = 0; x < columns; x += 1) {
    // 只在“可用行”之间做重力压缩；镂空格保持 null，棋子可穿过它下落补位。
    const playableRows = [];
    for (let y = rows - 1; y >= 0; y -= 1) {
      if (!isHole(x, y)) {
        playableRows.push(y);
      }
    }

    let writeIndex = 0;

    // 自下而上：把现有棋子依次压到最底部的可用行
    for (let readRow = rows - 1; readRow >= 0; readRow -= 1) {
      if (isHole(x, readRow)) {
        continue;
      }

      const tile = board[readRow][x];
      if (!tile) {
        continue;
      }

      const writeRow = playableRows[writeIndex];
      if (readRow !== writeRow) {
        board[writeRow][x] = tile;
        board[readRow][x] = null;
        dropped.push({ tile, fromY: readRow, toY: writeRow });
        tile.y = writeRow;
      }

      writeIndex += 1;
    }

    // 顶部剩余的可用行生成新棋子，从棋盘上方穿入
    let spawnIndex = 0;
    for (let index = writeIndex; index < playableRows.length; index += 1) {
      const row = playableRows[index];
      const tile = createTile(state, x, row, randomKind(tileKinds));
      board[row][x] = tile;
      spawned.push({ tile, fromRow: -1 - spawnIndex, toRow: row });
      spawnIndex += 1;
    }
  }

  return { dropped, spawned };
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

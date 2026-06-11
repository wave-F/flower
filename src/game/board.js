import { findMatches } from "./match.js";

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

export function createBoard({ state, columns, rows, tileKinds, maxAttempts }) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const nextBoard = [];

    for (let y = 0; y < rows; y += 1) {
      const row = [];

      for (let x = 0; x < columns; x += 1) {
        row.push(createTile(state, x, y, randomKind(tileKinds)));
      }

      nextBoard.push(row);
    }

    if (findMatches(nextBoard, columns, rows).length === 0) {
      return nextBoard;
    }
  }

  return createFallbackBoard({ state, columns, rows, tileKinds });
}

export function createFixedBoard({ state, layout, tileKindMap }) {
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

function createFallbackBoard({ state, columns, rows, tileKinds }) {
  const nextBoard = [];

  for (let y = 0; y < rows; y += 1) {
    const row = [];

    for (let x = 0; x < columns; x += 1) {
      const kind = tileKinds[(x + y * 2) % tileKinds.length];
      row.push(createTile(state, x, y, kind));
    }

    nextBoard.push(row);
  }

  return nextBoard;
}

export function applyRemovalsAndCollapse({ board, tilesToRemove, tileGroups, columns, rows, state, tileKinds }) {
  const removedTiles = [];
  const removedTileGroups = [];
  const groupsToRemove = tileGroups ?? [tilesToRemove];

  for (const group of groupsToRemove) {
    const removedGroup = [];

    for (const tile of group) {
      const currentTile = board[tile.y]?.[tile.x] ?? null;
      if (!currentTile || currentTile.id !== tile.id) {
        continue;
      }

      board[tile.y][tile.x] = null;
      removedTiles.push(currentTile);
      removedGroup.push(currentTile);
    }

    if (removedGroup.length > 0) {
      removedTileGroups.push(removedGroup);
    }
  }

  const collapseResult = collapseBoard({ board, columns, rows, state, tileKinds });

  return {
    removedTiles,
    removedTileGroups,
    dropped: collapseResult.dropped,
    spawned: collapseResult.spawned,
  };
}

function collapseBoard({ board, columns, rows, state, tileKinds }) {
  const dropped = [];
  const spawned = [];

  for (let x = 0; x < columns; x += 1) {
    let writeRow = rows - 1;

    for (let readRow = rows - 1; readRow >= 0; readRow -= 1) {
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
      const tile = createTile(state, x, row, randomKind(tileKinds));
      board[row][x] = tile;
      spawned.push({ tile, fromRow: -1 - spawnIndex, toRow: row });
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

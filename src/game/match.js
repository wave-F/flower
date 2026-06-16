import { getOrthogonalNeighbors, toCellKey } from "../utils/grid.js";

export function findMatches(boardState, columns, rows) {
  return findMatchGroups(boardState, columns, rows).flat();
}

export function findMatchGroups(boardState, columns, rows) {
  const visited = new Set();
  const matchGroups = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const tile = boardState[y]?.[x] ?? null;
      if (!tile || tile.special) {
        continue;
      }

      const key = toCellKey(x, y);
      if (visited.has(key)) {
        continue;
      }

      const group = collectConnectedGroup(boardState, x, y, columns, rows, visited);
      if (group.length < 3) {
        continue;
      }

      matchGroups.push(group);
    }
  }

  return matchGroups;
}

function collectConnectedGroup(boardState, startX, startY, columns, rows, visited) {
  const startTile = boardState[startY]?.[startX] ?? null;
  if (!startTile || startTile.special) {
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
    if (!tile || tile.special || tile.kind.key !== startTile.kind.key) {
      continue;
    }

    visited.add(key);
    group.push(tile);

    for (const neighbor of getOrthogonalNeighbors(cell.x, cell.y, columns, rows)) {
      if (!visited.has(toCellKey(neighbor.x, neighbor.y))) {
        stack.push(neighbor);
      }
    }
  }

  return group;
}

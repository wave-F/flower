export function toCellKey(x, y) {
  return `${x},${y}`;
}

export function columnLabel(index) {
  return String.fromCharCode(65 + index);
}

export function getOrthogonalNeighbors(x, y, columns, rows) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((cell) => cell.x >= 0 && cell.x < columns && cell.y >= 0 && cell.y < rows);
}

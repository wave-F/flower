export function fitBoardToViewport({ boardElement, boardShellElement, tileLayerElement, columns, rows }) {
  const shellWidth = boardShellElement.clientWidth || 360;
  const shellHeight = boardShellElement.clientHeight || 640;
  const gap = shellWidth <= 360 ? 4 : 6;
  const usableWidth = shellWidth - 8;
  const usableHeight = Math.floor(shellHeight * 0.56);
  const tileSizeByWidth = Math.floor((usableWidth - gap * (columns - 1)) / columns);
  const tileSizeByHeight = Math.floor((usableHeight - gap * (rows - 1)) / rows);
  const tileSize = Math.max(34, Math.min(tileSizeByWidth, tileSizeByHeight));
  const boardPixelWidth = columns * tileSize + (columns - 1) * gap;
  const gameScreenElement = boardShellElement.closest(".game-screen");

  boardElement.style.setProperty("--board-columns", String(columns));
  boardElement.style.setProperty("--board-rows", String(rows));
  boardElement.style.setProperty("--gap", `${gap}px`);
  boardElement.style.setProperty("--tile-size", `${tileSize}px`);
  tileLayerElement.style.setProperty("--gap", `${gap}px`);
  tileLayerElement.style.setProperty("--tile-size", `${tileSize}px`);
  if (gameScreenElement) {
    gameScreenElement.style.setProperty("--board-pixel-width", `${boardPixelWidth}px`);
  }
}

export function renderBoardSlots({ boardElement, columns, rows }) {
  boardElement.innerHTML = "";
  const span = getCellSpan(boardElement);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.style.left = `${x * span}px`;
      slot.style.top = `${y * span}px`;
      boardElement.appendChild(slot);
    }
  }
}

export function getBoardMetrics({ boardElement, boardShellElement }) {
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

function getCellSpan(boardElement) {
  const style = getComputedStyle(boardElement);
  const tileSize = parseFloat(style.getPropertyValue("--tile-size")) || 52;
  const gap = parseFloat(style.getPropertyValue("--gap")) || 6;
  return tileSize + gap;
}

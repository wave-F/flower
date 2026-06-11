import { getBoardMetrics } from "./boardLayout.js";

export function createTileView({ tileLayerElement, boardElement, boardShellElement, getInteractionDisabled }) {
  const tileElements = new Map();
  const tilePool = [];

  function clearAllTiles() {
    for (const element of tileElements.values()) {
      releaseTileElement(element);
    }

    tileElements.clear();
  }

  function getTileElement(tileId) {
    return tileElements.get(tileId) ?? null;
  }

  function forEachTileElement(callback) {
    for (const element of tileElements.values()) {
      callback(element);
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

  function mountSpawnedTile(tile, fromRow) {
    const element = acquireTileElement();
    decorateTileElement(element, tile);
    tileElements.set(tile.id, element);
    tileLayerElement.appendChild(element);
    placeTileAtBoardRowWithoutAnimation(element, tile.x, fromRow);
    element.classList.add("is-spawning");
    void element.offsetHeight;
    element.classList.remove("no-transition");
    return element;
  }

  function unmountTile(tileId) {
    const element = tileElements.get(tileId);
    if (!element) {
      return;
    }

    tileElements.delete(tileId);
    releaseTileElement(element);
  }

  function syncInteractivity() {
    const disabled = getInteractionDisabled();
    for (const element of tileElements.values()) {
      element.disabled = disabled;
    }
  }

  function refreshTilePositions(board, rows, columns) {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = board[y]?.[x] ?? null;
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

  function setTileBoardPosition(element, column, row) {
    const metrics = getBoardMetrics({ boardElement, boardShellElement });
    setTileStagePosition(element, metrics.left + column * metrics.span, metrics.top + row * metrics.span);
  }

  function getTileLayerElement() {
    return tileLayerElement;
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
    element.removeAttribute("aria-label");
    delete element.dataset.tileId;
    tilePool.push(element);
  }

  function decorateTileElement(element, tile) {
    element.type = "button";
    element.className = `tile tile--${tile.kind.key}`;
    element.textContent = "";
    element.dataset.tileId = String(tile.id);
    element.disabled = getInteractionDisabled();
    element.setAttribute("aria-label", `${tile.kind.name}，第 ${tile.x + 1} 列，第 ${tile.y + 1} 行`);
  }

  function getEntryStartPosition(column, stackIndex) {
    const metrics = getBoardMetrics({ boardElement, boardShellElement });

    return {
      left: metrics.left + column * metrics.span,
      top: -((stackIndex + 1) * metrics.span),
    };
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
    const metrics = getBoardMetrics({ boardElement, boardShellElement });
    placeTileWithoutAnimation(
      element,
      metrics.left + column * metrics.span,
      metrics.top + row * metrics.span,
    );
  }

  return {
    clearAllTiles,
    forEachTileElement,
    getTileElement,
    getTileLayerElement,
    mountSpawnedTile,
    mountTileForEntry,
    refreshTilePositions,
    setTileBoardPosition,
    syncInteractivity,
    unmountTile,
  };
}

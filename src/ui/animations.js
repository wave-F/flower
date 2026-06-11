import { wait } from "../utils/time.js";

export async function animateResolution({ result, tileView, removeDuration, fallDuration }) {
  animateRemoval(result.removedTiles, tileView);
  await wait(removeDuration);

  for (const tile of result.removedTiles) {
    tileView.unmountTile(tile.id);
  }

  animateDrops(result.dropped, result.spawned, tileView);
  await wait(fallDuration);
}

export async function animateBoardEntry({ board, tileView, columns, rows, entryFallDuration, entryColumnDelay }) {
  tileView.forEachTileElement((element) => {
    void element.offsetHeight;
  });

  for (let x = 0; x < columns; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const tile = board[y]?.[x] ?? null;
      const element = tile ? tileView.getTileElement(tile.id) : null;
      if (!element) {
        continue;
      }

      element.classList.add("is-entering");
      element.style.transitionDelay = `${x * entryColumnDelay}ms`;
      element.classList.remove("no-transition");
    }
  }

  void tileView.getTileLayerElement().offsetHeight;

  for (let x = 0; x < columns; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const tile = board[y]?.[x] ?? null;
      const element = tile ? tileView.getTileElement(tile.id) : null;
      if (element) {
        tileView.setTileBoardPosition(element, tile.x, tile.y);
      }
    }
  }

  await wait(entryFallDuration + entryColumnDelay * (columns - 1));

  tileView.forEachTileElement((element) => {
    element.classList.remove("is-entering");
    element.style.removeProperty("transition-delay");
  });
}

function animateRemoval(tiles, tileView) {
  for (const tile of tiles) {
    const element = tileView.getTileElement(tile.id);
    if (element) {
      element.classList.add("is-removing");
    }
  }
}

function animateDrops(dropped, spawned, tileView) {
  for (const move of dropped) {
    const element = tileView.getTileElement(move.tile.id);
    if (element) {
      tileView.setTileBoardPosition(element, move.tile.x, move.toY);
    }
  }

  for (const spawn of spawned) {
    const element = tileView.mountSpawnedTile(spawn.tile, spawn.fromRow);
    tileView.setTileBoardPosition(element, spawn.tile.x, spawn.toRow);
    requestAnimationFrame(() => {
      element.classList.remove("is-spawning");
    });
  }
}

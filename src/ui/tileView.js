import { getBoardMetrics } from "./boardLayout.js";

export function createTileView({ tileLayerElement, flyLayerElement, boardElement, boardShellElement, getInteractionDisabled }) {
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

  function mountTileForEntry(tile) {
    const element = acquireTileElement();
    decorateTileElement(element, tile);
    tileElements.set(tile.id, element);
    tileLayerElement.appendChild(element);

    placeTileAtBoardRowWithoutAnimation(element, tile.x, tile.y);
    element.style.opacity = "0";
    element.style.transform = "scale(0)";
  }

  function growTileIntoBoard(tileId, { duration, delay = 0, column, row, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    setTileBoardPosition(element, column, row);
    element.disabled = true;
    element.classList.add("is-growing");

    const animation = element.animate([
      { opacity: 0, transform: "scale(0)" },
      { opacity: 1, transform: "scale(1.12)", offset: 0.76 },
      { opacity: 1, transform: "scale(1)" },
    ], {
      duration,
      delay,
      easing: "cubic-bezier(0.18, 0.92, 0.22, 1)",
      fill: "both",
    });

    animation.finished.then(() => {
      animation.cancel();
      element.classList.remove("is-growing", "no-transition");
      element.disabled = getInteractionDisabled();
      element.style.removeProperty("opacity");
      element.style.removeProperty("transform");
      onArrive?.();
    }).catch(() => {
      onArrive?.();
    });
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

  function flyTile(tileId, { duration, targetRect = null, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      tileElements.delete(tileId);
      onArrive?.();
      return;
    }

    tileElements.delete(tileId);
    const startRect = liftTileToFlyLayer(element);

    if (targetRect) {
      flyTileByBezier(element, startRect, {
        duration,
        endCenterX: targetRect.left + targetRect.width / 2,
        endCenterY: targetRect.top + targetRect.height / 2,
        endScale: Math.max(0.2, Math.min(1, targetRect.width / startRect.width)),
        fadeOut: false,
        onArrive,
      });
      return;
    }

    if (onArrive) {
      releaseTileElement(element);
      onArrive?.();
      return;
    }

    // 无目标花：使用和目标花一致的贝塞尔飞行逻辑，只是终点落在屏幕外并淡出。
    const direction = Math.random() < 0.5 ? -1 : 1;
    const startCenterY = startRect.top + startRect.height / 2;
    const endCenterX = direction < 0
      ? -(startRect.width * (1.4 + Math.random()))
      : window.innerWidth + startRect.width * (0.4 + Math.random());
    const endCenterY = Math.max(
      -startRect.height,
      Math.min(window.innerHeight + startRect.height, startCenterY + (Math.random() - 0.5) * window.innerHeight * 0.72),
    );

    flyTileByBezier(element, startRect, {
      duration,
      endCenterX,
      endCenterY,
      endScale: 0.18 + Math.random() * 0.2,
      fadeOut: true,
      onArrive,
    });
  }

  function flyTileByBezier(element, startRect, {
    duration,
    delay = 0,
    endCenterX,
    endCenterY,
    startScale = 1,
    endScale,
    startOpacity = 1,
    fadeIn = false,
    fadeOut,
    onFinish = () => releaseTileElement(element),
    onArrive,
  }) {
    const startCenterX = startRect.left + startRect.width / 2;
    const startCenterY = startRect.top + startRect.height / 2;
    const deltaX = endCenterX - startCenterX;
    const deltaY = endCenterY - startCenterY;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const directionX = deltaX / distance;
    const directionY = deltaY / distance;
    const normalX = -directionY;
    const normalY = directionX;
    const side = Math.random() < 0.5 ? -1 : 1;
    const arc = Math.min(210, Math.max(54, distance * (0.18 + Math.random() * 0.18))) * side;
    const lift = Math.min(180, Math.max(38, distance * (0.08 + Math.random() * 0.08)));
    const firstT = 0.22 + Math.random() * 0.14;
    const secondT = 0.64 + Math.random() * 0.16;
    const control1 = {
      x: startCenterX + deltaX * firstT + normalX * arc - directionX * lift * 0.12,
      y: startCenterY + deltaY * firstT + normalY * arc - lift,
    };
    const control2 = {
      x: startCenterX + deltaX * secondT - normalX * arc * (0.42 + Math.random() * 0.28),
      y: startCenterY + deltaY * secondT - normalY * arc * (0.42 + Math.random() * 0.28) - lift * 0.42,
    };
    const rotation = (Math.random() < 0.5 ? -1 : 1) * (320 + Math.random() * 260);
    const bloomStrength = 0.1 + Math.random() * 0.04;
    const startTime = performance.now() + delay;
    let animationFrame = 0;
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      cancelAnimationFrame(animationFrame);
      onFinish();
      onArrive?.();
    };

    const step = (now) => {
      if (now < startTime) {
        animationFrame = requestAnimationFrame(step);
        return;
      }

      const rawProgress = Math.min(1, (now - startTime) / duration);
      const progress = easeInOutCubic(rawProgress);
      const point = cubicBezierPoint(
        startCenterX,
        startCenterY,
        control1.x,
        control1.y,
        control2.x,
        control2.y,
        endCenterX,
        endCenterY,
        progress,
      );
      const bloom = Math.sin(rawProgress * Math.PI) * bloomStrength;
      const scale = lerp(startScale, endScale, progress) + bloom;
      const opacity = fadeOut
        ? Math.max(0, startOpacity - progress * progress)
        : fadeIn
          ? lerp(startOpacity, 1, progress)
          : lerp(startOpacity, 0.86, progress);

      element.style.transform = `translate(${point.x - startCenterX}px, ${point.y - startCenterY}px) scale(${scale}) rotate(${rotation * progress}deg)`;
      element.style.opacity = String(opacity);

      if (rawProgress >= 1) {
        finish();
        return;
      }

      animationFrame = requestAnimationFrame(step);
    };

    animationFrame = requestAnimationFrame(step);
    setTimeout(finish, delay + duration + 120);
  }

  function cubicBezierPoint(startX, startY, control1X, control1Y, control2X, control2Y, endX, endY, progress) {
    const inverse = 1 - progress;
    const inverseSquared = inverse * inverse;
    const progressSquared = progress * progress;
    const startWeight = inverseSquared * inverse;
    const control1Weight = 3 * inverseSquared * progress;
    const control2Weight = 3 * inverse * progressSquared;
    const endWeight = progressSquared * progress;

    return {
      x: startX * startWeight + control1X * control1Weight + control2X * control2Weight + endX * endWeight,
      y: startY * startWeight + control1Y * control1Weight + control2Y * control2Weight + endY * endWeight,
    };
  }

  function easeInOutCubic(progress) {
    return progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - ((-2 * progress + 2) ** 3) / 2;
  }

  function lerp(start, end, progress) {
    return start + (end - start) * progress;
  }

  // 把元素移入顶层浮层并改用 fixed 视口定位，避免被 HUD 遮挡或被 board-shell 裁切
  // 注意：移出棋盘层后 --tile-size 继承断裂，必须显式固定像素宽高，否则宽高解析为 0（看不见）
  function liftTileToFlyLayer(element) {
    const startRect = element.getBoundingClientRect();
    element.disabled = true;
    element.classList.add("is-flying");
    flyLayerElement.appendChild(element);
    element.style.width = `${startRect.width}px`;
    element.style.height = `${startRect.height}px`;
    element.style.left = `${startRect.left}px`;
    element.style.top = `${startRect.top}px`;
    return startRect;
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
    element.style.removeProperty("width");
    element.style.removeProperty("height");
    element.style.removeProperty("opacity");
    element.style.removeProperty("transform");
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
    flyTile,
    getTileElement,
    growTileIntoBoard,
    mountSpawnedTile,
    mountTileForEntry,
    refreshTilePositions,
    setTileBoardPosition,
    syncInteractivity,
    unmountTile,
  };
}

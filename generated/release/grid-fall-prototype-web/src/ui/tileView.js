import { getBoardMetrics } from "./boardLayout.js";

export function createTileView({ brickLayerElement, tileLayerElement, flyLayerElement, boardElement, boardShellElement, getInteractionDisabled }) {
  const tileElements = new Map();
  const tilePool = [];
  const brickElements = new Map();
  const crateElements = new Map();

  function clearAllTiles() {
    for (const element of tileElements.values()) {
      releaseTileElement(element);
    }

    tileElements.clear();
  }

  function clearBricks() {
    for (const element of brickElements.values()) {
      element.remove();
    }

    for (const element of crateElements.values()) {
      element.remove();
    }

    brickElements.clear();
    crateElements.clear();
    brickLayerElement?.replaceChildren();
  }

  function renderBricks(bricks, crates = new Map(), metrics = getCurrentBoardMetrics()) {
    clearBricks();
    if (!brickLayerElement) {
      return;
    }

    for (const brick of bricks.values()) {
      const element = document.createElement("div");
      element.className = `brick${brick.damage > 0 ? " brick--damaged" : ""}`;
      setTileBoardPosition(element, brick.x, brick.y, metrics);
      brickLayerElement.appendChild(element);
      brickElements.set(`${brick.x},${brick.y}`, element);
    }

    for (const crate of crates.values()) {
      const element = document.createElement("div");
      element.className = `crate${crate.damage > 0 ? " crate--damaged" : ""}`;
      setTileBoardPosition(element, crate.x, crate.y, metrics);
      brickLayerElement.appendChild(element);
      crateElements.set(`${crate.x},${crate.y}`, element);
    }
  }

  function refreshBrickPositions(bricks, crates = new Map()) {
    const metrics = getCurrentBoardMetrics();
    for (const brick of bricks.values()) {
      const element = brickElements.get(`${brick.x},${brick.y}`);
      if (element) {
        setTileBoardPosition(element, brick.x, brick.y, metrics);
      }
    }

    for (const crate of crates.values()) {
      const element = crateElements.get(`${crate.x},${crate.y}`);
      if (element) {
        setTileBoardPosition(element, crate.x, crate.y, metrics);
      }
    }
  }

  function getTileElement(tileId) {
    return tileElements.get(tileId) ?? null;
  }

  function getTileRect(tileId) {
    return tileElements.get(tileId)?.getBoundingClientRect() ?? null;
  }

  function mountTileForEntry(tile, metrics = getCurrentBoardMetrics()) {
    const element = acquireTileElement();
    decorateTileElement(element, tile);
    tileElements.set(tile.id, element);
    tileLayerElement.appendChild(element);

    placeTileAtBoardRowWithoutAnimation(element, tile.x, tile.y, metrics);
    element.style.opacity = "0";
    element.style.transform = "scale(0)";
  }

  function growTileIntoBoard(tileId, { duration, delay = 0, column, row, metrics = getCurrentBoardMetrics(), onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    setTileBoardPosition(element, column, row, metrics);
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

  function mountSpawnedTile(tile, fromRow, metrics = getCurrentBoardMetrics()) {
    const element = acquireTileElement();
    decorateTileElement(element, tile);
    tileElements.set(tile.id, element);
    tileLayerElement.appendChild(element);
    placeTileAtBoardRowWithoutAnimation(element, tile.x, fromRow, metrics);
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

  function updateTile(tile) {
    const element = tileElements.get(tile.id);
    if (!element) {
      return;
    }

    decorateTileElement(element, tile);
  }

  function setWindmillFusionState(tileId, { hideArrow = false, spin = false } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      return;
    }

    element.classList.toggle("tile--fusion-hiding-arrow", hideArrow);
    element.classList.toggle("tile--fusion-spinning", spin);
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

  function flyBee({ fromTileId, fromRect = null, toTileId, duration, delay = 0, onArrive } = {}) {
    const fromElement = tileElements.get(fromTileId);
    const toElement = tileElements.get(toTileId);
    const beeFromRect = fromRect ?? fromElement?.getBoundingClientRect() ?? null;
    if (!beeFromRect || !toElement) {
      onArrive?.();
      return;
    }

    const toRect = toElement.getBoundingClientRect();
    const size = Math.max(26, Math.min(46, beeFromRect.width * 0.72));
    const startRect = {
      left: beeFromRect.left + beeFromRect.width / 2 - size / 2,
      top: beeFromRect.top + beeFromRect.height / 2 - size / 2,
      width: size,
      height: size,
    };
    const beeElement = document.createElement("span");
    beeElement.className = "bee-flyer";
    beeElement.style.width = `${size}px`;
    beeElement.style.height = `${size}px`;
    beeElement.style.left = `${startRect.left}px`;
    beeElement.style.top = `${startRect.top}px`;
    flyLayerElement.appendChild(beeElement);

    flyTileByBezier(beeElement, startRect, {
      duration,
      delay,
      endCenterX: toRect.left + toRect.width / 2,
      endCenterY: toRect.top + toRect.height / 2,
      endScale: 0.92,
      fadeOut: false,
      rotate: false,
      onFinish: () => beeElement.remove(),
      onArrive,
    });
  }

  function mergeTileIntoTile(
    fromTileId,
    toTileId,
    {
      retreatDuration = 140,
      slamDuration = 220,
      retreatDistance = 18,
      onArrive,
    } = {},
  ) {
    const element = tileElements.get(fromTileId);
    const targetElement = tileElements.get(toTileId);
    if (!element || !targetElement) {
      onArrive?.();
      return;
    }

    tileElements.delete(fromTileId);
    const startRect = liftTileToFlyLayer(element);
    const targetRect = targetElement.getBoundingClientRect();
    const startCenterX = startRect.left + startRect.width / 2;
    const startCenterY = startRect.top + startRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const directionX = targetCenterX - startCenterX;
    const directionY = targetCenterY - startCenterY;
    const normalized = normalizeDirection(directionX, directionY);
    const retreatX = -normalized.x * retreatDistance;
    const retreatY = -normalized.y * retreatDistance;
    const impactX = targetCenterX - startCenterX;
    const impactY = targetCenterY - startCenterY;

    const retreatAnimation = element.animate([
      { opacity: 1, transform: "translate(0, 0) scale(1)" },
      { opacity: 1, transform: `translate(${retreatX}px, ${retreatY}px) scale(0.94)` },
    ], {
      duration: retreatDuration,
      easing: "cubic-bezier(0.24, 0.84, 0.22, 1)",
      fill: "forwards",
    });

    retreatAnimation.finished.then(() => {
      retreatAnimation.cancel();
      element.style.transform = `translate(${retreatX}px, ${retreatY}px) scale(0.94)`;
      element.style.opacity = "1";

      const slamAnimation = element.animate([
        { opacity: 1, transform: `translate(${retreatX}px, ${retreatY}px) scale(0.94)` },
        { opacity: 1, transform: `translate(${impactX * 0.78}px, ${impactY * 0.78}px) scale(1.06)`, offset: 0.72 },
        { opacity: 0, transform: `translate(${impactX}px, ${impactY}px) scale(0.2)` },
      ], {
        duration: slamDuration,
        easing: "cubic-bezier(0.12, 0.82, 0.22, 1)",
        fill: "forwards",
      });

      slamAnimation.finished.then(() => {
        slamAnimation.cancel();
        releaseTileElement(element);
        onArrive?.();
      }).catch(() => {
        releaseTileElement(element);
        onArrive?.();
      });
    }).catch(() => {
      releaseTileElement(element);
      onArrive?.();
    });
  }

  function pulseTile(tileId, { duration = 120, scaleMultiplier = 1.34, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    const animation = element.animate([
      { transform: "scale(1)", opacity: 1 },
      { transform: `scale(${scaleMultiplier})`, opacity: 1, offset: 0.58 },
      { transform: "scale(1)", opacity: 1 },
    ], {
      duration,
      easing: "cubic-bezier(0.18, 0.92, 0.22, 1)",
      fill: "both",
    });

    animation.finished.then(() => {
      animation.cancel();
      element.style.removeProperty("transform");
      onArrive?.();
    }).catch(() => {
      element.style.removeProperty("transform");
      onArrive?.();
    });
  }

  function popTile(
    tileId,
    {
      duration,
      spinUpDuration = duration * 0.36,
      burstDuration = duration * 0.4,
      scaleMultiplier = 1,
      onArrive,
    } = {},
  ) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    tileElements.delete(tileId);
    element.disabled = true;
    element.classList.add("is-popping");
    const spinUpOffset = Math.min(0.8, Math.max(0.1, spinUpDuration / duration));
    const burstEndOffset = Math.min(0.94, Math.max(spinUpOffset + 0.05, (spinUpDuration + burstDuration) / duration));
    const boostedScale = 1.2 * scaleMultiplier;
    const finalScale = 0.18 * Math.max(0.8, scaleMultiplier * 0.7);
    const initialTransform = getComputedStyle(element).transform;
    const initialOpacity = Number.parseFloat(getComputedStyle(element).opacity || "1") || 1;
    element.classList.remove("tile--fusion-spinning", "tile--fusion-hiding-arrow");
    if (initialTransform !== "none") {
      element.style.transform = initialTransform;
    }

    const animation = element.animate([
      {
        opacity: initialOpacity,
        transform: initialTransform === "none" ? "scale(1) rotate(0deg)" : initialTransform,
        easing: "cubic-bezier(0.22, 0, 0.24, 1)",
      },
      { opacity: 1, transform: `scale(${boostedScale}) rotate(280deg)`, offset: spinUpOffset, easing: "linear" },
      { opacity: 1, transform: `scale(${boostedScale}) rotate(700deg)`, offset: burstEndOffset, easing: "cubic-bezier(0.34, 0, 0.72, 1)" },
      { opacity: 0, transform: `scale(${finalScale}) rotate(820deg)` },
    ], {
      duration,
      easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
      fill: "both",
    });

    animation.finished.then(() => {
      animation.cancel();
      releaseTileElement(element);
      onArrive?.();
    }).catch(() => {
      releaseTileElement(element);
      onArrive?.();
    });
  }

  function shrinkTile(tileId, { duration, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    tileElements.delete(tileId);
    element.disabled = true;
    element.classList.add("is-popping");

    const animation = element.animate([
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.12)" },
    ], {
      duration,
      easing: "cubic-bezier(0.18, 0.72, 0.22, 1)",
      fill: "both",
    });

    animation.finished.then(() => {
      animation.cancel();
      releaseTileElement(element);
      onArrive?.();
    }).catch(() => {
      releaseTileElement(element);
      onArrive?.();
    });
  }

  function burstTile(tileId, { duration, directionX, directionY, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    tileElements.delete(tileId);
    const startRect = liftTileToFlyLayer(element);
    const distance = startRect.width * (2.2 + Math.random() * 0.7);
    const drift = startRect.width * (Math.random() - 0.5) * 0.52;
    const normalized = normalizeDirection(directionX, directionY);
    const endX = normalized.x * distance + -normalized.y * drift;
    const endY = normalized.y * distance + normalized.x * drift;
    const rotation = (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 120);

    const animation = element.animate([
      { opacity: 1, transform: "translate(0, 0) scale(1) rotate(0deg)" },
      { opacity: 0.92, transform: `translate(${endX * 0.38}px, ${endY * 0.38}px) scale(1.08) rotate(${rotation * 0.35}deg)`, offset: 0.34 },
      { opacity: 0, transform: `translate(${endX}px, ${endY}px) scale(0.38) rotate(${rotation}deg)` },
    ], {
      duration,
      easing: "cubic-bezier(0.12, 0.72, 0.22, 1)",
      fill: "both",
    });

    animation.finished.then(() => {
      animation.cancel();
      releaseTileElement(element);
      onArrive?.();
    }).catch(() => {
      releaseTileElement(element);
      onArrive?.();
    });
  }

  function normalizeDirection(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
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
    rotate = true,
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

      const rotationTransform = rotate ? ` rotate(${rotation * progress}deg)` : "";
      element.style.transform = `translate(${point.x - startCenterX}px, ${point.y - startCenterY}px) scale(${scale})${rotationTransform}`;
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
    element.style.setProperty("--tile-size", `${startRect.width}px`);
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
    const metrics = getCurrentBoardMetrics();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const tile = board[y]?.[x] ?? null;
        if (!tile) {
          continue;
        }

        const element = tileElements.get(tile.id);
        if (element) {
          setTileBoardPosition(element, x, y, metrics);
        }
      }
    }
  }

  function setTileBoardPosition(element, column, row, metrics = getCurrentBoardMetrics()) {
    setTileStagePosition(element, metrics.left + column * metrics.span, metrics.top + row * metrics.span);
  }

  function getCurrentBoardMetrics() {
    return getBoardMetrics({ boardElement, boardShellElement });
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
    element.style.removeProperty("--drop-duration");
    element.style.removeProperty("--tile-size");
    element.removeAttribute("aria-label");
    delete element.dataset.tileId;
    delete element.dataset.specialType;
    tilePool.push(element);
  }

  function decorateTileElement(element, tile) {
    element.type = "button";
    element.className = `tile tile--${tile.kind.key}`;
    if (tile.special?.type) {
      element.classList.add("tile--special", `tile--special-${tile.special.type}`);
      element.dataset.specialType = tile.special.type;
    } else {
      delete element.dataset.specialType;
    }

    element.textContent = "";
    element.dataset.tileId = String(tile.id);
    element.disabled = getInteractionDisabled();
    const specialLabel = getSpecialTileLabel(tile.special?.type);
    element.setAttribute("aria-label", `${specialLabel}${tile.kind.name}，第 ${tile.x + 1} 列，第 ${tile.y + 1} 行`);
  }

  function getSpecialTileLabel(type) {
    if (type === "windmill") {
      return "风车，";
    }

    if (type === "mergedWindmill") {
      return "大风车，";
    }

    if (type === "hive") {
      return "蜂巢，";
    }

    return "";
  }

  function setTileStagePosition(element, left, top) {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  function setDropDuration(element, duration) {
    element.style.setProperty("--drop-duration", `${duration}ms`);
  }

  function placeTileWithoutAnimation(element, left, top) {
    element.classList.add("no-transition");
    setTileStagePosition(element, left, top);
  }

  function placeTileAtBoardRowWithoutAnimation(element, column, row, metrics = getCurrentBoardMetrics()) {
    placeTileWithoutAnimation(
      element,
      metrics.left + column * metrics.span,
      metrics.top + row * metrics.span,
    );
  }

  return {
    clearAllTiles,
    clearBricks,
    burstTile,
    flyBee,
    flyTile,
    getTileElement,
    getTileRect,
    growTileIntoBoard,
    getBoardMetrics: getCurrentBoardMetrics,
    mergeTileIntoTile,
    mountSpawnedTile,
    pulseTile,
    mountTileForEntry,
    refreshBrickPositions,
    refreshTilePositions,
    renderBricks,
    popTile,
    setWindmillFusionState,
    setDropDuration,
    setTileBoardPosition,
    shrinkTile,
    syncInteractivity,
    unmountTile,
    updateTile,
  };
}

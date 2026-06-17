import { getBoardMetrics } from "./boardLayout.js";
import { createExplosionFx } from "./explosionFx.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function createTileView({ brickLayerElement, tileLayerElement, flyLayerElement, boardElement, boardShellElement, getInteractionDisabled }) {
  const tileElements = new Map();
  const tilePool = [];
  const explosionFx = createExplosionFx({ boardShellElement });
  let windGustIdSeed = 0;
  let lightningLinkIdSeed = 0;
  const brickElements = new Map();
  const crateElements = new Map();

  function clearAllTiles() {
    explosionFx.clear();
    flyLayerElement.querySelectorAll(".lightning-link").forEach((element) => element.remove());
    flyLayerElement.querySelectorAll(".lightball-fusion-focus").forEach((element) => element.remove());
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

  function playObstacleShatterEffects(cells = [], { type = "crate", assetPath } = {}) {
    if (!assetPath || cells.length === 0) {
      return;
    }

    const shardCount = cells.length >= 4
      ? 1
      : type === "crate"
        ? 2
        : 1;

    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      const element = type === "crate"
        ? crateElements.get(key)
        : brickElements.get(key);
      const rect = element?.getBoundingClientRect() ?? null;
      if (!rect) {
        continue;
      }

      spawnObstacleShatter(rect, { type, assetPath, shardCount });
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

  function animateDropPath(element, path = [], { duration, metrics = getCurrentBoardMetrics() } = {}) {
    if (!element || path.length === 0) {
      return;
    }

    if (element._dropAnimation) {
      element._dropAnimation.cancel();
      delete element._dropAnimation;
    }

    const startLeft = parseFloat(element.style.left) || 0;
    const startTop = parseFloat(element.style.top) || 0;
    const points = [{ left: startLeft, top: startTop, step: 0 }];

    for (const point of path) {
      points.push({
        left: metrics.left + point.x * metrics.span,
        top: metrics.top + point.y * metrics.span,
        step: point.step,
      });
    }

    const keyframes = buildDropKeyframes(points);
    const finalPoint = points[points.length - 1];
    element.classList.add("is-dropping");
    element.style.left = `${finalPoint.left}px`;
    element.style.top = `${finalPoint.top}px`;

    if (keyframes.length === 1) {
      element.classList.remove("is-dropping", "is-spawning");
      return;
    }

    const animation = element.animate(keyframes, {
      duration,
      easing: "linear",
      fill: "both",
    });
    element._dropAnimation = animation;

    animation.finished.then(() => {
      if (element._dropAnimation !== animation) {
        return;
      }

      animation.cancel();
      delete element._dropAnimation;
      element.classList.remove("is-dropping", "is-spawning");
      element.style.left = `${finalPoint.left}px`;
      element.style.top = `${finalPoint.top}px`;
    }).catch(() => {
      if (element._dropAnimation === animation) {
        delete element._dropAnimation;
        element.classList.remove("is-dropping", "is-spawning");
      }
    });
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

  function playBombExplosion(rect, { strength = 1, maxRadius = null } = {}) {
    explosionFx.emitExplosion({ rect, strength, maxRadius });
  }

  function primeBombTile(tileId, { duration = 280, maxScale = 1.28, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    const animation = element.animate([
      { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: "translate3d(-1px, 0, 0) scale(1.04) rotate(-2deg)", offset: 0.14 },
      { transform: "translate3d(1px, 0, 0) scale(1.08) rotate(2deg)", offset: 0.28 },
      { transform: "translate3d(-2px, 0, 0) scale(1.12) rotate(-3deg)", offset: 0.44 },
      { transform: "translate3d(3px, 0, 0) scale(1.17) rotate(4deg)", offset: 0.62 },
      { transform: "translate3d(-4px, 0, 0) scale(1.22) rotate(-5deg)", offset: 0.78 },
      { transform: "translate3d(2px, 0, 0) scale(1.25) rotate(2deg)", offset: 0.9 },
      { transform: `translate3d(0, 0, 0) scale(${maxScale}) rotate(0deg)`, opacity: 1 },
    ], {
      duration,
      easing: "linear",
      fill: "both",
    });

    animation.finished.then(() => {
      animation.cancel();
      element.style.transform = `scale(${maxScale})`;
      onArrive?.();
    }).catch(() => {
      onArrive?.();
    });
  }

  function setWindmillFusionState(tileId, { hideArrow = false, spin = false } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      return;
    }

    element.classList.toggle("tile--fusion-hiding-arrow", hideArrow);
    element.classList.toggle("tile--fusion-spinning", spin);
  }

  function setLightballChargeState(tileId, active = true) {
    const element = tileElements.get(tileId);
    if (!element) {
      return;
    }

    element.classList.toggle("is-lightball-charging", active);
  }

  function setLightballFusionState(tileId, active = true) {
    const element = tileElements.get(tileId);
    if (!element) {
      return;
    }

    element.classList.toggle("is-lightball-fusing", active);
  }

  function setLightballSelectedState(tileId, active = true) {
    const element = tileElements.get(tileId);
    if (!element) {
      return;
    }

    element.classList.toggle("tile--lightball-selected", active);
  }

  function playLightningLinks({
    fromTileId,
    toTileIds = [],
    duration = 220,
    stagger = 24,
    onTargetLock,
  } = {}) {
    const fromRect = getTileRect(fromTileId);
    if (!fromRect || toTileIds.length === 0) {
      return Promise.resolve();
    }

    const fromCenterX = fromRect.left + fromRect.width / 2;
    const fromCenterY = fromRect.top + fromRect.height / 2;
    const linkPromises = [];

    toTileIds.forEach((targetTileId, index) => {
      const targetRect = getTileRect(targetTileId);
      if (!targetRect) {
        return;
      }

      const toCenterX = targetRect.left + targetRect.width / 2;
      const toCenterY = targetRect.top + targetRect.height / 2;
      const delay = index * stagger;
      const link = createLightningLinkElement({
        fromCenterX,
        fromCenterY,
        toCenterX,
        toCenterY,
      });
      link.element.style.setProperty("--lightning-duration", `${duration}ms`);
      flyLayerElement.appendChild(link.element);

      const lockTimeout = setTimeout(() => {
        onTargetLock?.(targetTileId);
      }, delay + duration * 0.68);

      const linkPromise = new Promise((resolve) => {
        let settled = false;
        let startTimeout = 0;
        let fallbackTimeout = 0;
        let opacityAnimation = null;
        const cleanup = () => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(startTimeout);
          clearTimeout(fallbackTimeout);
          clearTimeout(lockTimeout);
          opacityAnimation?.cancel();
          link.element.remove();
          resolve();
        };

        startTimeout = setTimeout(() => {
          const startTime = performance.now();
          link.element.classList.add("is-active");
          opacityAnimation = link.element.animate([
            { opacity: 0 },
            { opacity: 1, offset: 0.12 },
            { opacity: 0.96, offset: 0.74 },
            { opacity: 0, offset: 1 },
          ], {
            duration,
            easing: "linear",
            fill: "both",
          });
          opacityAnimation.finished.then(cleanup).catch(() => {
            if (!settled) {
              cleanup();
            }
          });
        }, delay);

        fallbackTimeout = setTimeout(cleanup, delay + duration + 180);
      });

      linkPromises.push(linkPromise);
    });

    return Promise.all(linkPromises);
  }

  function createLightningLinkElement({ fromCenterX, fromCenterY, toCenterX, toCenterY }) {
    const padding = 28;
    const left = Math.min(fromCenterX, toCenterX) - padding;
    const top = Math.min(fromCenterY, toCenterY) - padding;
    const width = Math.abs(toCenterX - fromCenterX) + padding * 2;
    const height = Math.abs(toCenterY - fromCenterY) + padding * 2;
    const startX = fromCenterX - left;
    const startY = fromCenterY - top;
    const endX = toCenterX - left;
    const endY = toCenterY - top;
    const length = Math.hypot(endX - startX, endY - startY) || 1;
    const linkId = `lightning-link-${lightningLinkIdSeed}`;
    lightningLinkIdSeed += 1;
    const element = createSvgElement("svg");
    const defsElement = createSvgElement("defs");
    const gradientElement = createSvgElement("linearGradient");
    const glowPath = createSvgElement("line");
    const corePath = createSvgElement("line");
    const startFlare = createSvgElement("circle");
    const endFlare = createSvgElement("circle");

    element.classList.add("lightning-link");
    element.setAttribute("viewBox", `0 0 ${width} ${height}`);
    element.setAttribute("width", String(width));
    element.setAttribute("height", String(height));
    element.setAttribute("aria-hidden", "true");
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.setProperty("--beam-length", String(length));

    gradientElement.setAttribute("id", linkId);
    gradientElement.setAttribute("gradientUnits", "userSpaceOnUse");
    gradientElement.setAttribute("x1", String(startX));
    gradientElement.setAttribute("y1", String(startY));
    gradientElement.setAttribute("x2", String(endX));
    gradientElement.setAttribute("y2", String(endY));
    appendLightningGradientStop(gradientElement, "0%", "#fff4c4", 0.18);
    appendLightningGradientStop(gradientElement, "12%", "#ffe187", 0.92);
    appendLightningGradientStop(gradientElement, "38%", "#ff8fd2", 0.96);
    appendLightningGradientStop(gradientElement, "62%", "#7bdfff", 0.98);
    appendLightningGradientStop(gradientElement, "84%", "#84f5b2", 0.94);
    appendLightningGradientStop(gradientElement, "100%", "#fffce3", 0.68);
    defsElement.appendChild(gradientElement);

    glowPath.classList.add("lightning-link-path", "lightning-link-path--glow");
    corePath.classList.add("lightning-link-path", "lightning-link-path--core");
    glowPath.setAttribute("stroke", `url(#${linkId})`);
    corePath.setAttribute("stroke", `url(#${linkId})`);

    startFlare.classList.add("lightning-link-flare", "lightning-link-flare--source");
    startFlare.setAttribute("cx", String(startX));
    startFlare.setAttribute("cy", String(startY));
    startFlare.setAttribute("r", "6.5");
    endFlare.classList.add("lightning-link-flare", "lightning-link-flare--target");
    endFlare.setAttribute("cx", String(endX));
    endFlare.setAttribute("cy", String(endY));
    endFlare.setAttribute("r", "4.5");

    setLightningLinkGeometry(glowPath, startX, startY, endX, endY);
    setLightningLinkGeometry(corePath, startX, startY, endX, endY);

    element.append(defsElement, glowPath, corePath, startFlare, endFlare);

    return {
      element,
      glowPath,
      corePath,
    };
  }

  function appendLightningGradientStop(gradientElement, offset, color, opacity = 1) {
    const stopElement = createSvgElement("stop");
    stopElement.setAttribute("offset", offset);
    stopElement.setAttribute("stop-color", color);
    stopElement.setAttribute("stop-opacity", String(opacity));
    gradientElement.appendChild(stopElement);
  }

  function setLightningLinkGeometry(lineElement, startX, startY, endX, endY) {
    lineElement.setAttribute("x1", String(startX));
    lineElement.setAttribute("y1", String(startY));
    lineElement.setAttribute("x2", String(endX));
    lineElement.setAttribute("y2", String(endY));
  }

  function playWindLines({
    fromRect,
    toTileIds = [],
    duration = 220,
    stagger = 0,
    windConfig = {},
    onTargetHit,
  } = {}) {
    if (!fromRect || toTileIds.length === 0) {
      return Promise.resolve();
    }

    const fromCenterX = fromRect.left + fromRect.width / 2;
    const fromCenterY = fromRect.top + fromRect.height / 2;
    const linePromises = [];

    toTileIds.forEach((targetTileId, index) => {
      const targetRect = getTileRect(targetTileId);
      if (!targetRect) {
        onTargetHit?.(targetTileId);
        return;
      }

      const toCenterX = targetRect.left + targetRect.width / 2;
      const toCenterY = targetRect.top + targetRect.height / 2;
      const deltaX = toCenterX - fromCenterX;
      const deltaY = toCenterY - fromCenterY;
      const length = Math.hypot(deltaX, deltaY);
      const delay = index * stagger;
      const gustElement = createWindGustSvg({
        fromCenterX,
        fromCenterY,
        toCenterX,
        toCenterY,
        length,
        windConfig,
      });
      const dustPromise = emitWindDust({
        fromCenterX,
        fromCenterY,
        toCenterX,
        toCenterY,
        duration,
        delay,
        windConfig,
      });
      gustElement.style.setProperty("--wind-line-duration", `${duration}ms`);
      gustElement.style.setProperty("--wind-line-delay", `${delay}ms`);
      flyLayerElement.appendChild(gustElement);

      const hitTimeout = setTimeout(() => {
        onTargetHit?.(targetTileId);
      }, delay + duration * 0.68);

      const linePromise = new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(hitTimeout);
          gustElement.remove();
          resolve();
        };

        gustElement.addEventListener("animationend", cleanup, { once: true });
        setTimeout(cleanup, delay + duration + 180);
      });

      requestAnimationFrame(() => {
        gustElement.classList.add("is-active");
      });
      linePromises.push(Promise.all([linePromise, dustPromise]));
    });

    return Promise.all(linePromises);
  }

  function createWindGustSvg({ fromCenterX, fromCenterY, toCenterX, toCenterY, length, windConfig = {} }) {
    const padding = Math.max(18, Math.min(42, length * 0.16));
    const width = Math.max(1, length + padding * 2);
    const height = Math.max(34, Math.min(72, length * 0.34));
    const angle = Math.atan2(toCenterY - fromCenterY, toCenterX - fromCenterX);
    const gustElement = createSvgElement("svg");
    const pathSet = buildWindGustShapes({ width, height, length, padding, windConfig });
    const gustId = `wind-gust-${windGustIdSeed}`;
    windGustIdSeed += 1;

    gustElement.classList.add("wind-gust");
    gustElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
    gustElement.setAttribute("width", String(width));
    gustElement.setAttribute("height", String(height));
    gustElement.setAttribute("aria-hidden", "true");
    gustElement.style.left = `${fromCenterX - padding}px`;
    gustElement.style.top = `${fromCenterY - height / 2}px`;
    gustElement.style.width = `${width}px`;
    gustElement.style.height = `${height}px`;
    gustElement.style.transform = `rotate(${angle}rad)`;
    gustElement.style.transformOrigin = `${padding}px ${height / 2}px`;
    appendWindGustDefs(gustElement, gustId);

    pathSet.forEach((shapeConfig) => {
      appendWindGustShape(gustElement, gustId, shapeConfig.softLayer);
      appendWindGustShape(gustElement, gustId, shapeConfig.mainLayer);
    });

    return gustElement;
  }

  function appendWindGustDefs(gustElement, gustId) {
    const defsElement = createSvgElement("defs");
    const blurFilter = createSvgElement("filter");
    blurFilter.setAttribute("id", `${gustId}-soft-blur`);
    blurFilter.setAttribute("x", "-24%");
    blurFilter.setAttribute("y", "-24%");
    blurFilter.setAttribute("width", "148%");
    blurFilter.setAttribute("height", "148%");
    const gaussianBlur = createSvgElement("feGaussianBlur");
    gaussianBlur.setAttribute("stdDeviation", "2.4");
    blurFilter.appendChild(gaussianBlur);
    defsElement.appendChild(blurFilter);
    gustElement.appendChild(defsElement);
  }

  function appendWindGustShape(gustElement, gustId, {
    className,
    d,
    durationScale,
    driftX,
    driftY,
    filterId = null,
  } = {}) {
    const pathElement = createSvgElement("path");
    pathElement.classList.add("wind-gust-shape");
    className
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => {
        pathElement.classList.add(token);
      });
    pathElement.setAttribute("d", d);
    if (filterId) {
      pathElement.setAttribute("filter", `url(#${gustId}-${filterId})`);
    }
    pathElement.style.setProperty("--wind-duration-scale", String(durationScale));
    pathElement.style.setProperty("--wind-drift-x", `${driftX}px`);
    pathElement.style.setProperty("--wind-drift-y", `${driftY}px`);
    pathElement.style.setProperty("--wind-settle-x", `${driftX * 0.3}px`);
    pathElement.style.setProperty("--wind-settle-y", `${driftY * 0.3}px`);
    gustElement.appendChild(pathElement);
  }

  function buildWindGustShapes({ width, height, length, padding, windConfig = {} }) {
    const centerY = height / 2;
    const arcBase = Math.max(8, Math.min(22, length * 0.1)) * (windConfig.windCurlScale ?? 1);
    const startX = padding;
    const endX = padding + length;
    const widthScale = windConfig.windWidthScale ?? 1;
    const spreadScale = windConfig.windSpreadScale ?? 1;
    const descriptors = [
      {
        className: "wind-gust-shape--core",
        centerShift: -1 * spreadScale,
        startWidth: 2 * widthScale,
        midWidthA: 13 * widthScale,
        midWidthB: 8 * widthScale,
        endWidth: 2 * widthScale,
        topBiasA: arcBase * -0.32,
        topBiasB: arcBase * 0.18,
        bottomBiasA: arcBase * 0.48,
        bottomBiasB: arcBase * -0.16,
        durationScale: 1,
        driftX: 0,
        driftY: -2 * spreadScale,
      },
      {
        className: "wind-gust-shape--upper",
        centerShift: -7 * spreadScale,
        startWidth: 1.5 * widthScale,
        midWidthA: 8 * widthScale,
        midWidthB: 5 * widthScale,
        endWidth: 1.4 * widthScale,
        topBiasA: arcBase * -0.86,
        topBiasB: arcBase * 0.38,
        bottomBiasA: arcBase * 0.22,
        bottomBiasB: arcBase * -0.12,
        durationScale: 0.92,
        driftX: 0,
        driftY: -4 * spreadScale,
      },
      {
        className: "wind-gust-shape--lower",
        centerShift: 8 * spreadScale,
        startWidth: 1.2 * widthScale,
        midWidthA: 6 * widthScale,
        midWidthB: 4 * widthScale,
        endWidth: 1 * widthScale,
        topBiasA: arcBase * -0.18,
        topBiasB: arcBase * 0.12,
        bottomBiasA: arcBase * 0.94,
        bottomBiasB: arcBase * -0.44,
        durationScale: 1.08,
        driftX: 0,
        driftY: 4 * spreadScale,
      },
    ];

    return descriptors.map((descriptor) => {
      const d = buildWindRibbonPath({ startX, endX, centerY, length, descriptor });

      return {
        softLayer: {
          className: `${descriptor.className} wind-gust-shape--mist`,
          d,
          durationScale: descriptor.durationScale * 1.05,
          driftX: descriptor.driftX * 0.7,
          driftY: descriptor.driftY * 0.7,
          filterId: "soft-blur",
        },
        mainLayer: {
          className: descriptor.className,
          d,
          durationScale: descriptor.durationScale,
          driftX: descriptor.driftX,
          driftY: descriptor.driftY,
        },
      };
    });
  }

  function buildWindRibbonPath({ startX, endX, centerY, length, descriptor }) {
    const y = centerY + descriptor.centerShift;
    const x1 = startX + length * 0.18;
    const x2 = startX + length * 0.44;
    const x3 = startX + length * 0.76;
    const startTop = y - descriptor.startWidth;
    const midTopA = y - descriptor.midWidthA + descriptor.topBiasA;
    const midTopB = y - descriptor.midWidthB + descriptor.topBiasB;
    const endTop = y - descriptor.endWidth;
    const endBottom = y + descriptor.endWidth;
    const midBottomB = y + descriptor.midWidthB + descriptor.bottomBiasB;
    const midBottomA = y + descriptor.midWidthA + descriptor.bottomBiasA;
    const startBottom = y + descriptor.startWidth;

    return [
      `M ${startX} ${startTop}`,
      `C ${x1} ${midTopA}, ${x2} ${midTopB}, ${endX} ${endTop}`,
      `C ${x3} ${midBottomB}, ${x2} ${midBottomA}, ${startX} ${startBottom}`,
      "Z",
    ].join(" ");
  }

  function emitWindDust({ fromCenterX, fromCenterY, toCenterX, toCenterY, duration, delay, windConfig = {} }) {
    const particleCount = Math.max(0, Math.round(windConfig.windDustCount ?? 3));
    if (particleCount <= 0) {
      return Promise.resolve();
    }
    const promises = [];

    for (let index = 0; index < particleCount; index += 1) {
      promises.push(new Promise((resolve) => {
        const dustElement = document.createElement("span");
        const distance = Math.hypot(toCenterX - fromCenterX, toCenterY - fromCenterY) || 1;
        const directionX = (toCenterX - fromCenterX) / distance;
        const directionY = (toCenterY - fromCenterY) / distance;
        const normalX = -directionY;
        const normalY = directionX;
        const startProgress = 0.1 + index * 0.1 + Math.random() * 0.05;
        const endProgress = 0.72 + index * 0.06 + Math.random() * 0.05;
        const wobble = Math.max(8, Math.min(22, distance * 0.12)) * (windConfig.windDustWobbleScale ?? 1);
        const startPoint = sampleWindPoint({
          fromCenterX,
          fromCenterY,
          toCenterX,
          toCenterY,
          progress: startProgress,
          normalX,
          normalY,
          wobble: wobble * (Math.random() < 0.5 ? -0.5 : 0.5),
        });
        const endPoint = sampleWindPoint({
          fromCenterX,
          fromCenterY,
          toCenterX,
          toCenterY,
          progress: Math.min(0.98, endProgress),
          normalX,
          normalY,
          wobble: wobble * (Math.random() - 0.5),
        });
        const size = (5 + Math.random() * 5) * (windConfig.windDustSizeScale ?? 1);
        const particleDelay = delay + Math.round(duration * (0.14 + index * 0.08));
        const particleDuration = Math.round(duration * (0.46 + Math.random() * 0.12));

        dustElement.className = "wind-gust-mote";
        dustElement.style.width = `${size}px`;
        dustElement.style.height = `${size}px`;
        dustElement.style.left = `${startPoint.x - size / 2}px`;
        dustElement.style.top = `${startPoint.y - size / 2}px`;
        flyLayerElement.appendChild(dustElement);

        const animation = dustElement.animate([
          { opacity: 0, transform: "translate3d(0, 0, 0) scale(0.38)" },
          { opacity: 0.8, transform: `translate3d(${(endPoint.x - startPoint.x) * 0.42}px, ${(endPoint.y - startPoint.y) * 0.42}px, 0) scale(1)`, offset: 0.24 },
          { opacity: 0.36, transform: `translate3d(${(endPoint.x - startPoint.x) * 0.82}px, ${(endPoint.y - startPoint.y) * 0.82}px, 0) scale(0.94)`, offset: 0.72 },
          { opacity: 0, transform: `translate3d(${endPoint.x - startPoint.x}px, ${endPoint.y - startPoint.y}px, 0) scale(0.3)` },
        ], {
          duration: particleDuration,
          delay: particleDelay,
          easing: "cubic-bezier(0.22, 0.78, 0.22, 1)",
          fill: "both",
        });

        animation.finished.then(() => {
          animation.cancel();
          dustElement.remove();
          resolve();
        }).catch(() => {
          dustElement.remove();
          resolve();
        });
      }));
    }

    return Promise.all(promises);
  }

  function sampleWindPoint({ fromCenterX, fromCenterY, toCenterX, toCenterY, progress, normalX, normalY, wobble }) {
    const deltaX = toCenterX - fromCenterX;
    const deltaY = toCenterY - fromCenterY;
    const curve = Math.sin(progress * Math.PI) * wobble;
    return {
      x: fromCenterX + deltaX * progress + normalX * curve,
      y: fromCenterY + deltaY * progress + normalY * curve,
    };
  }

  function createSvgElement(tagName) {
    return document.createElementNS(SVG_NS, tagName);
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

  function flyRewardToTile({ fromRect = null, toTileId, assetPath, duration, delay = 0, onArrive } = {}) {
    const toElement = tileElements.get(toTileId);
    if (!fromRect || !toElement || !assetPath) {
      onArrive?.();
      return;
    }

    const toRect = toElement.getBoundingClientRect();
    const size = Math.max(28, Math.min(50, Math.max(fromRect.width, fromRect.height) * 1.05));
    const startRect = {
      left: fromRect.left + fromRect.width / 2 - size / 2,
      top: fromRect.top + fromRect.height / 2 - size / 2,
      width: size,
      height: size,
    };
    const rewardElement = document.createElement("span");
    rewardElement.className = "reward-flyer";
    rewardElement.style.width = `${size}px`;
    rewardElement.style.height = `${size}px`;
    rewardElement.style.left = `${startRect.left}px`;
    rewardElement.style.top = `${startRect.top}px`;
    rewardElement.style.setProperty("--reward-image", `url("${assetPath}")`);
    flyLayerElement.appendChild(rewardElement);

    flyTileByBezier(rewardElement, startRect, {
      duration,
      delay,
      endCenterX: toRect.left + toRect.width / 2,
      endCenterY: toRect.top + toRect.height / 2,
      startScale: 0.88,
      endScale: 0.92,
      fadeOut: false,
      onFinish: () => rewardElement.remove(),
      onArrive,
    });
  }

  function flyLightballParticle({
    fromRect = null,
    targetRect = null,
    duration,
    delay = 0,
    spawnDuration = 120,
    holdDuration = 36,
    spawnOffsetX = 0,
    spawnOffsetY = 0,
    targetOffsetX = 0,
    targetOffsetY = 0,
    arcMultiplier = 1,
    liftMultiplier = 1,
    curveSide = null,
    onArrive,
  } = {}) {
    if (!fromRect || !targetRect) {
      onArrive?.();
      return;
    }

    const sourceSize = Math.min(fromRect.width, fromRect.height);
    const size = Math.max(7, Math.min(11, sourceSize * 0.16));
    const originLeft = fromRect.left + fromRect.width / 2 - size / 2;
    const originTop = fromRect.top + fromRect.height / 2 - size / 2;
    const startRect = {
      left: originLeft + spawnOffsetX,
      top: originTop + spawnOffsetY,
      width: size,
      height: size,
    };
    const particleElement = document.createElement("span");
    particleElement.className = "lightball-particle";
    particleElement.style.width = `${size}px`;
    particleElement.style.height = `${size}px`;
    particleElement.style.left = `${originLeft}px`;
    particleElement.style.top = `${originTop}px`;
    particleElement.style.setProperty("--particle-size", `${Math.round(size)}px`);
    particleElement.style.setProperty("--trail-length", `${Math.round(size * 4.8)}px`);
    flyLayerElement.appendChild(particleElement);

    const launchFlight = () => {
      flyTileByBezier(particleElement, startRect, {
        duration,
        delay,
        endCenterX: targetRect.left + targetRect.width / 2 + targetOffsetX,
        endCenterY: targetRect.top + targetRect.height / 2 + targetOffsetY,
        startScale: 0.82,
        endScale: 0.26,
        startOpacity: 0.96,
        fadeIn: false,
        fadeOut: false,
        rotate: false,
        alignToPath: true,
        arcMultiplier,
        liftMultiplier,
        curveSide,
        bloomStrength: 0.028,
        endOpacity: 0.74,
        onFinish: () => particleElement.remove(),
        onArrive,
      });
    };

    if (spawnDuration > 0) {
      particleElement.style.opacity = "0";
      particleElement.style.transform = "translate(0, 0) scale(0.12)";
      const offsetX = startRect.left - originLeft;
      const offsetY = startRect.top - originTop;
      const spawnAnimation = particleElement.animate([
        { opacity: 0, transform: "translate(0, 0) scale(0.12)" },
        { opacity: 0.76, transform: `translate(${offsetX * 0.42}px, ${offsetY * 0.42}px) scale(0.78)`, offset: 0.38 },
        { opacity: 0.94, transform: `translate(${offsetX * 0.82}px, ${offsetY * 0.82}px) scale(1.06)`, offset: 0.8 },
        { opacity: 0.96, transform: `translate(${offsetX}px, ${offsetY}px) scale(0.82)` },
      ], {
        duration: spawnDuration,
        easing: "cubic-bezier(0.12, 0.82, 0.22, 1)",
        fill: "both",
      });

      spawnAnimation.finished.then(() => {
        spawnAnimation.cancel();
        particleElement.style.left = `${startRect.left}px`;
        particleElement.style.top = `${startRect.top}px`;
        particleElement.style.opacity = "0.96";
        particleElement.style.transform = "scale(0.82)";
        window.setTimeout(launchFlight, holdDuration);
      }).catch(() => {
        launchFlight();
      });
      return;
    }

    launchFlight();
  }

  function spawnObstacleShatter(rect, { type = "crate", assetPath, shardCount = 1 } = {}) {
    const shardConfigs = [
      { clip: "polygon(0 0, 100% 0, 48% 54%, 0 46%)", dx: -18, dy: -18, rotate: -18, delay: 0 },
      { clip: "polygon(48% 46%, 100% 38%, 100% 100%, 40% 100%)", dx: 16, dy: 18, rotate: 20, delay: 18 },
    ].slice(0, shardCount);

    for (const config of shardConfigs) {
      const shard = document.createElement("span");
      shard.className = `obstacle-shard obstacle-shard--${type}`;
      shard.style.left = `${rect.left}px`;
      shard.style.top = `${rect.top}px`;
      shard.style.width = `${rect.width}px`;
      shard.style.height = `${rect.height}px`;
      shard.style.setProperty("--obstacle-image", `url(\"${assetPath}\")`);
      shard.style.clipPath = config.clip;
      flyLayerElement.appendChild(shard);

      const animation = shard.animate([
        {
          opacity: 1,
          transform: "translate(0, 0) scale(1) rotate(0deg)",
          filter: type === "ice"
            ? "drop-shadow(0 0 8px rgba(195, 240, 255, 0.42))"
            : "drop-shadow(0 3px 6px rgba(92, 58, 28, 0.16))",
        },
        {
          opacity: 0,
          transform: `translate(${config.dx}px, ${config.dy}px) scale(0.78) rotate(${config.rotate}deg)`,
          filter: type === "ice"
            ? "drop-shadow(0 0 12px rgba(195, 240, 255, 0.18))"
            : "drop-shadow(0 2px 4px rgba(92, 58, 28, 0.06))",
        },
      ], {
        duration: 260,
        delay: config.delay,
        easing: "cubic-bezier(0.18, 0.92, 0.22, 1)",
        fill: "forwards",
      });

      animation.finished.finally(() => {
        shard.remove();
      });
    }
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

  function orbitTilesIntoFusion(
    primaryTileId,
    secondaryTileId,
    {
      duration = 320,
      orbitSpeed = 1.7,
      clockwise = true,
      endScale = 0.88,
      flareDuration = 160,
      stopDuration = 0,
      collisionDuration = 160,
      stopRadiusScale = 0.88,
      orbitStretchScale = 0.12,
      collisionPeakScale = 1.24,
      collisionEndScale = 0.22,
      collisionFadeStart = 0.8,
      onArrive,
    } = {},
  ) {
    const primaryElement = tileElements.get(primaryTileId);
    const secondaryElement = tileElements.get(secondaryTileId);
    if (!primaryElement || !secondaryElement) {
      onArrive?.();
      return;
    }

    const primaryRect = liftTileToFlyLayer(primaryElement);
    const secondaryRect = liftTileToFlyLayer(secondaryElement);
    tileElements.delete(secondaryTileId);

    const primaryStart = {
      x: primaryRect.left + primaryRect.width / 2,
      y: primaryRect.top + primaryRect.height / 2,
    };
    const secondaryStart = {
      x: secondaryRect.left + secondaryRect.width / 2,
      y: secondaryRect.top + secondaryRect.height / 2,
    };
    const center = {
      x: (primaryStart.x + secondaryStart.x) / 2,
      y: (primaryStart.y + secondaryStart.y) / 2,
    };
    const primaryStartAngle = Math.atan2(primaryStart.y - center.y, primaryStart.x - center.x);
    const secondaryStartAngle = Math.atan2(secondaryStart.y - center.y, secondaryStart.x - center.x);
    const primaryRadius = Math.hypot(primaryStart.x - center.x, primaryStart.y - center.y);
    const secondaryRadius = Math.hypot(secondaryStart.x - center.x, secondaryStart.y - center.y);
    const rotationDirection = clockwise ? 1 : -1;
    const totalAngle = Math.PI * 2 * orbitSpeed * (duration / 1000) * rotationDirection;
    const startTime = performance.now();
    let animationFrame = 0;
    let settled = false;
    let orbitCompleted = false;
    let lastOrbitAngleOffset = 0;
    let lastPrimaryRadius = primaryRadius;
    let lastSecondaryRadius = secondaryRadius;
    let lastPrimaryScale = 1;
    let lastSecondaryScale = 1;
    let stopTimer = 0;

    primaryElement.style.zIndex = "75";
    secondaryElement.style.zIndex = "75";

    const updateOrbitalState = (element, rect, angle, radius, scale, opacity) => {
      const currentCenterX = center.x + Math.cos(angle) * radius;
      const currentCenterY = center.y + Math.sin(angle) * radius;
      element.style.left = `${currentCenterX - rect.width / 2}px`;
      element.style.top = `${currentCenterY - rect.height / 2}px`;
      element.style.transform = `scale(${scale})`;
      element.style.opacity = String(opacity);
    };

    const playFusionFlare = () => {
      const flareSize = Math.max(primaryRect.width, secondaryRect.width) * 2.2;
      const flareElement = document.createElement("span");
      flareElement.style.position = "fixed";
      flareElement.style.left = `${center.x - flareSize / 2}px`;
      flareElement.style.top = `${center.y - flareSize / 2}px`;
      flareElement.style.width = `${flareSize}px`;
      flareElement.style.height = `${flareSize}px`;
      flareElement.style.borderRadius = "50%";
      flareElement.style.pointerEvents = "none";
      flareElement.style.zIndex = "76";
      flareElement.style.background = "radial-gradient(circle, rgba(255, 255, 255, 0.98) 0 12%, rgba(255, 247, 208, 0.92) 18%, rgba(255, 216, 125, 0.48) 36%, rgba(255, 185, 96, 0.14) 58%, rgba(255, 185, 96, 0) 76%)";
      flareElement.style.boxShadow = "0 0 28px rgba(255, 248, 224, 0.96), 0 0 68px rgba(255, 201, 125, 0.42)";
      flareElement.style.opacity = "0";
      flyLayerElement.appendChild(flareElement);

      const flareAnimation = flareElement.animate([
        { opacity: 0, transform: "scale(0.08)" },
        { opacity: 1, transform: "scale(0.42)", offset: 0.18 },
        { opacity: 1, transform: "scale(1)", offset: 0.46 },
        { opacity: 0, transform: "scale(1.24)" },
      ], {
        duration: flareDuration,
        easing: "cubic-bezier(0.16, 0.84, 0.22, 1)",
        fill: "both",
      });

      flareAnimation.finished.then(() => {
        flareAnimation.cancel();
        flareElement.remove();
      }).catch(() => {
        flareElement.remove();
      });
    };

    const settleOrbitPose = () => {
      updateOrbitalState(
        primaryElement,
        primaryRect,
        primaryStartAngle + lastOrbitAngleOffset,
        lastPrimaryRadius,
        lastPrimaryScale,
        1,
      );
      updateOrbitalState(
        secondaryElement,
        secondaryRect,
        secondaryStartAngle + lastOrbitAngleOffset,
        lastSecondaryRadius,
        lastSecondaryScale,
        1,
      );
    };

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      cancelAnimationFrame(animationFrame);
      clearTimeout(stopTimer);
      primaryElement.style.left = `${center.x - primaryRect.width / 2}px`;
      primaryElement.style.top = `${center.y - primaryRect.height / 2}px`;
      primaryElement.style.transform = "scale(0.34)";
      primaryElement.style.opacity = "0";
      secondaryElement.style.left = `${center.x - secondaryRect.width / 2}px`;
      secondaryElement.style.top = `${center.y - secondaryRect.height / 2}px`;
      secondaryElement.style.transform = "scale(0.34)";
      secondaryElement.style.opacity = "0";
      primaryElement.classList.remove("is-lightball-fusing");
      secondaryElement.classList.remove("is-lightball-fusing");
      playFusionFlare();
      releaseTileElement(secondaryElement);
      primaryElement.style.removeProperty("z-index");
      onArrive?.();
    };

    const startCollision = () => {
      const collisionStart = performance.now();

      const collideStep = (now) => {
        const rawProgress = Math.min(1, (now - collisionStart) / collisionDuration);
        const progress = easeInCubic(rawProgress);
        const primaryCurrentRadius = lerp(lastPrimaryRadius, 0, progress);
        const secondaryCurrentRadius = lerp(lastSecondaryRadius, 0, progress);
        const peakBoundary = 0.66;
        const endBoundary = Math.max(0.01, 1 - peakBoundary);
        const primaryScale = rawProgress < peakBoundary
          ? lerp(lastPrimaryScale, collisionPeakScale, rawProgress / peakBoundary)
          : lerp(collisionPeakScale, collisionEndScale, (rawProgress - peakBoundary) / endBoundary);
        const secondaryScale = rawProgress < peakBoundary
          ? lerp(lastSecondaryScale, collisionPeakScale, rawProgress / peakBoundary)
          : lerp(collisionPeakScale, collisionEndScale, (rawProgress - peakBoundary) / endBoundary);
        const fadeWindow = Math.max(0.01, 1 - collisionFadeStart);
        const opacity = rawProgress < collisionFadeStart ? 1 : Math.max(0, 1 - (rawProgress - collisionFadeStart) / fadeWindow);

        updateOrbitalState(
          primaryElement,
          primaryRect,
          primaryStartAngle + lastOrbitAngleOffset,
          primaryCurrentRadius,
          primaryScale,
          opacity,
        );
        updateOrbitalState(
          secondaryElement,
          secondaryRect,
          secondaryStartAngle + lastOrbitAngleOffset,
          secondaryCurrentRadius,
          secondaryScale,
          opacity,
        );

        if (rawProgress >= 1) {
          finish();
          return;
        }

        animationFrame = requestAnimationFrame(collideStep);
      };

      animationFrame = requestAnimationFrame(collideStep);
    };

    const step = (now) => {
      const rawProgress = Math.min(1, (now - startTime) / duration);
      const progress = easeInOutCubic(rawProgress);
      const angularProgress = rawProgress;
      const angleOffset = totalAngle * angularProgress;
      const radiusProgress = easeInOutCubic(rawProgress);
      const primaryCurrentRadius = lerp(primaryRadius, primaryRadius * stopRadiusScale, radiusProgress);
      const secondaryCurrentRadius = lerp(secondaryRadius, secondaryRadius * stopRadiusScale, radiusProgress);
      const baseScale = lerp(1, endScale, progress);
      const orbitStretch = 1 + Math.sin(progress * Math.PI) * orbitStretchScale;
      const primaryScale = baseScale * orbitStretch;
      const secondaryScale = baseScale * orbitStretch;

      lastOrbitAngleOffset = angleOffset;
      lastPrimaryRadius = primaryCurrentRadius;
      lastSecondaryRadius = secondaryCurrentRadius;
      lastPrimaryScale = primaryScale;
      lastSecondaryScale = secondaryScale;

      updateOrbitalState(primaryElement, primaryRect, primaryStartAngle + angleOffset, primaryCurrentRadius, primaryScale, 1);
      updateOrbitalState(secondaryElement, secondaryRect, secondaryStartAngle + angleOffset, secondaryCurrentRadius, secondaryScale, 1);

      if (rawProgress >= 1) {
        if (orbitCompleted) {
          return;
        }

        orbitCompleted = true;
        settleOrbitPose();
        stopTimer = window.setTimeout(startCollision, stopDuration);
        return;
      }

      animationFrame = requestAnimationFrame(step);
    };

    animationFrame = requestAnimationFrame(step);
    window.setTimeout(() => {
      if (!orbitCompleted) {
        orbitCompleted = true;
        settleOrbitPose();
        stopTimer = window.setTimeout(startCollision, stopDuration);
      }
    }, duration + 80);
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

  function gustHitTile(tileId, { duration = 120, directionX = 0, directionY = 0, onArrive } = {}) {
    const element = tileElements.get(tileId);
    if (!element) {
      onArrive?.();
      return;
    }

    const rect = element.getBoundingClientRect();
    const direction = normalizeDirection(directionX, directionY);
    const offset = Math.max(4, Math.min(10, rect.width * 0.14));
    const initialTransform = getComputedStyle(element).transform;
    const baseTransform = initialTransform === "none" ? "" : `${initialTransform} `;
    const pushX = direction.x * offset;
    const pushY = direction.y * offset;
    const settleX = direction.x * (offset * 0.28);
    const settleY = direction.y * (offset * 0.28);
    const rotate = Math.max(-8, Math.min(8, direction.x * 8));

    const animation = element.animate([
      { transform: `${baseTransform}translate3d(0, 0, 0) rotate(0deg) scale(1)` },
      { transform: `${baseTransform}translate3d(${pushX}px, ${pushY}px, 0) rotate(${rotate}deg) scale(0.88, 1.1)`, offset: 0.34 },
      { transform: `${baseTransform}translate3d(${settleX}px, ${settleY}px, 0) rotate(${rotate * -0.28}deg) scale(1.04, 0.96)`, offset: 0.72 },
      { transform: `${baseTransform}translate3d(0, 0, 0) rotate(0deg) scale(1)` },
    ], {
      duration,
      easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
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

  function playBoardFlash({ duration = 240, maxOpacity = 0.96, onPeak, onArrive } = {}) {
    const flashElement = document.createElement("span");
    flashElement.style.position = "absolute";
    flashElement.style.inset = "0";
    flashElement.style.zIndex = "72";
    flashElement.style.pointerEvents = "none";
    flashElement.style.opacity = "0";
    flashElement.style.background = [
      "radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.56) 28%, rgba(255, 239, 197, 0.18) 54%, rgba(255, 239, 197, 0) 76%)",
      "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 247, 222, 0.62))",
    ].join(",");
    flyLayerElement.appendChild(flashElement);

    const peakDelay = Math.max(40, duration * 0.24);
    const peakTimeout = setTimeout(() => {
      onPeak?.();
    }, peakDelay);
    const animation = flashElement.animate([
      { opacity: 0 },
      { opacity: maxOpacity, offset: 0.22 },
      { opacity: maxOpacity * 0.34, offset: 0.6 },
      { opacity: 0 },
    ], {
      duration,
      easing: "cubic-bezier(0.18, 0.92, 0.22, 1)",
      fill: "both",
    });

    animation.finished.then(() => {
      clearTimeout(peakTimeout);
      animation.cancel();
      flashElement.remove();
      onArrive?.();
    }).catch(() => {
      clearTimeout(peakTimeout);
      flashElement.remove();
      onArrive?.();
    });
  }

  function showLightballFusionFocus({ maxOpacity = 0.86, fadeInDuration = 180, fadeOutDuration = 170 } = {}) {
    const focusElement = document.createElement("span");
    focusElement.className = "lightball-fusion-focus";
    focusElement.style.opacity = "0";
    focusElement.style.zIndex = "74";
    flyLayerElement.appendChild(focusElement);

    const fadeInAnimation = focusElement.animate([
      { opacity: 0 },
      { opacity: maxOpacity },
    ], {
      duration: fadeInDuration,
      easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
      fill: "forwards",
    });

    let settled = false;
    const cleanup = () => {
      if (settled) {
        return;
      }

      settled = true;
      focusElement.remove();
    };

    return {
      dismiss() {
        return new Promise((resolve) => {
          fadeInAnimation.finished.catch(() => undefined).finally(() => {
            if (!focusElement.isConnected) {
              resolve();
              return;
            }

            const fadeOutAnimation = focusElement.animate([
              { opacity: maxOpacity },
              { opacity: 0 },
            ], {
              duration: fadeOutDuration,
              easing: "cubic-bezier(0.36, 0, 0.2, 1)",
              fill: "forwards",
            });

            fadeOutAnimation.finished.then(() => {
              fadeOutAnimation.cancel();
              cleanup();
              resolve();
            }).catch(() => {
              cleanup();
              resolve();
            });
          });
        });
      },
    };
  }

  function playBoardShockwave({
    rect,
    duration = 320,
    sizeMultiplier = 7.2,
    coverViewport = false,
    visible = true,
    shakeStrength = 0,
    targetRects = [],
    onTargetReach,
    onPeak,
    onArrive,
  } = {}) {
    if (!rect) {
      onPeak?.();
      onArrive?.();
      return;
    }

    if (shakeStrength > 0) {
      shakeBoardShell(shakeStrength);
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const hostRect = flyLayerElement.getBoundingClientRect();
    const localCenterX = centerX - hostRect.left;
    const localCenterY = centerY - hostRect.top;
    const size = coverViewport
      ? Math.max(
        260,
        Math.max(
          Math.hypot(localCenterX, localCenterY),
          Math.hypot(hostRect.width - localCenterX, localCenterY),
          Math.hypot(localCenterX, hostRect.height - localCenterY),
          Math.hypot(hostRect.width - localCenterX, hostRect.height - localCenterY),
        ) * 2,
      )
      : Math.max(260, Math.min(960, Math.max(rect.width, rect.height) * sizeMultiplier));
    const shockwaveHost = document.createElement("span");
    const shockwaveElement = document.createElement("span");
    if (visible) {
      shockwaveHost.style.position = "absolute";
      shockwaveHost.style.inset = "0";
      shockwaveHost.style.overflow = "hidden";
      shockwaveHost.style.pointerEvents = "none";
      shockwaveHost.style.zIndex = "71";
      shockwaveElement.style.position = "absolute";
      shockwaveElement.style.left = `${localCenterX}px`;
      shockwaveElement.style.top = `${localCenterY}px`;
      shockwaveElement.style.width = `${size}px`;
      shockwaveElement.style.height = `${size}px`;
      shockwaveElement.style.marginLeft = `${size * -0.5}px`;
      shockwaveElement.style.marginTop = `${size * -0.5}px`;
      shockwaveElement.style.borderRadius = "50%";
      shockwaveElement.style.opacity = "0";
      shockwaveElement.style.background = coverViewport
        ? "radial-gradient(circle, rgba(255, 255, 255, 0) 52%, rgba(255, 247, 214, 0.18) 57%, rgba(255, 247, 214, 0.88) 62%, rgba(255, 214, 146, 0.86) 68%, rgba(255, 160, 88, 0.42) 78%, rgba(255, 160, 88, 0) 88%), radial-gradient(circle, rgba(255, 247, 214, 0.26) 0 14%, rgba(255, 214, 146, 0.12) 24%, rgba(255, 214, 146, 0) 40%)"
        : "radial-gradient(circle, rgba(255, 255, 255, 0.82) 0 5%, rgba(255, 244, 209, 0.3) 14%, rgba(255, 183, 116, 0.18) 32%, rgba(255, 183, 116, 0) 64%)";
      shockwaveElement.style.boxShadow = coverViewport
        ? "0 0 64px rgba(255, 240, 201, 0.56), 0 0 180px rgba(255, 154, 82, 0.34), inset 0 0 46px rgba(255, 244, 210, 0.16)"
        : "0 0 34px rgba(255, 234, 186, 0.3), 0 0 84px rgba(255, 190, 116, 0.16)";
      if (coverViewport) {
        shockwaveElement.style.mixBlendMode = "screen";
        shockwaveElement.style.filter = "saturate(1.18)";
      }
      shockwaveHost.appendChild(shockwaveElement);
      flyLayerElement.appendChild(shockwaveHost);
    }

    const pendingTargets = targetRects
      .filter((entry) => entry?.rect && entry?.id != null)
      .map((entry) => ({
        id: entry.id,
        distance: Math.hypot(
          entry.rect.left + entry.rect.width / 2 - centerX,
          entry.rect.top + entry.rect.height / 2 - centerY,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    const peakDelay = Math.max(60, duration * (coverViewport ? 0.42 : 0.28));
    const peakTimeout = setTimeout(() => {
      onPeak?.();
    }, peakDelay);
    const sweepStart = performance.now();
    let sweepFrame = 0;
    const animation = visible
      ? shockwaveElement.animate(getShockwaveKeyframes(coverViewport), {
        duration,
        easing: coverViewport ? "linear" : "cubic-bezier(0.16, 0.84, 0.22, 1)",
        fill: "both",
      })
      : null;

    const stepSweep = (now) => {
      const progress = Math.min(1, Math.max(0, (now - sweepStart) / duration));
      const currentRadius = size * getShockwaveScaleAtProgress(progress) * 0.5;

      while (pendingTargets.length > 0 && currentRadius >= pendingTargets[0].distance) {
        const reachedTarget = pendingTargets.shift();
        onTargetReach?.(reachedTarget.id);
      }

      if (progress >= 1) {
        pendingTargets.splice(0).forEach((target) => {
          onTargetReach?.(target.id);
        });
        return;
      }

      sweepFrame = requestAnimationFrame(stepSweep);
    };

    sweepFrame = requestAnimationFrame(stepSweep);

    const finalize = () => {
      clearTimeout(peakTimeout);
      cancelAnimationFrame(sweepFrame);
      animation?.cancel();
      shockwaveHost.remove();
      onArrive?.();
    };

    if (!animation) {
      setTimeout(finalize, duration + 20);
      return;
    }

    animation.finished.then(finalize).catch(finalize);
  }

  function getShockwaveScaleAtProgress(progress) {
    if (progress <= 0.12) {
      return lerp(0.04, 0.16, progress / 0.12);
    }

    if (progress <= 0.36) {
      return lerp(0.16, 0.42, (progress - 0.12) / 0.24);
    }

    if (progress <= 0.74) {
      return lerp(0.42, 0.82, (progress - 0.36) / 0.38);
    }

    return lerp(0.82, 1, (progress - 0.74) / 0.26);
  }

  function getShockwaveKeyframes(coverViewport) {
    if (!coverViewport) {
      return [
        { opacity: 0, transform: "scale(0.08)" },
        { opacity: 1, transform: "scale(0.26)", offset: 0.18 },
        { opacity: 0.42, transform: "scale(0.74)", offset: 0.54 },
        { opacity: 0, transform: "scale(1)" },
      ];
    }

    return [
      { opacity: 0, transform: "scale(0.04)" },
      { opacity: 0.98, transform: "scale(0.16)", offset: 0.12 },
      { opacity: 1, transform: "scale(0.42)", offset: 0.36 },
      { opacity: 0.94, transform: "scale(0.82)", offset: 0.74 },
      { opacity: 0.76, transform: "scale(0.94)", offset: 0.9 },
      { opacity: 0, transform: "scale(1)" },
    ];
  }

  function shakeBoardShell(strength = 1) {
    if (!boardShellElement?.animate) {
      return;
    }

    const amplitude = Math.min(24, Math.max(6, strength * 8));
    const duration = Math.round(180 + strength * 40);
    boardShellElement.animate([
      { transform: "translate3d(0, 0, 0) scale(1)" },
      { transform: `translate3d(${-amplitude}px, 0, 0) scale(1.01)`, offset: 0.16 },
      { transform: `translate3d(${amplitude * 0.92}px, 0, 0) scale(0.995)`, offset: 0.32 },
      { transform: `translate3d(${-(amplitude * 0.68)}px, 0, 0) scale(1.008)`, offset: 0.52 },
      { transform: `translate3d(${amplitude * 0.38}px, 0, 0) scale(0.998)`, offset: 0.74 },
      { transform: "translate3d(0, 0, 0) scale(1)" },
    ], {
      duration,
      easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
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
    alignToPath = false,
    arcMultiplier = 1,
    liftMultiplier = 1,
    curveSide = null,
    bloomStrength = null,
    endOpacity = 0.86,
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
    const side = curveSide == null ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(curveSide) || 1;
    const arc = Math.min(210, Math.max(54, distance * (0.18 + Math.random() * 0.18))) * arcMultiplier * side;
    const lift = Math.min(180, Math.max(38, distance * (0.08 + Math.random() * 0.08))) * liftMultiplier;
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
    const resolvedBloomStrength = Number.isFinite(bloomStrength) ? bloomStrength : 0.1 + Math.random() * 0.04;
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
      const tangent = alignToPath
        ? cubicBezierTangent(
          startCenterX,
          startCenterY,
          control1.x,
          control1.y,
          control2.x,
          control2.y,
          endCenterX,
          endCenterY,
          progress,
        )
        : null;
      const bloom = Math.sin(rawProgress * Math.PI) * resolvedBloomStrength;
      const scale = lerp(startScale, endScale, progress) + bloom;
      const opacity = fadeOut
        ? Math.max(0, startOpacity - progress * progress)
        : fadeIn
          ? lerp(startOpacity, 1, progress)
          : lerp(startOpacity, endOpacity, progress);

      if (alignToPath && tangent) {
        const angle = Math.atan2(tangent.y, tangent.x) * (180 / Math.PI);
        element.style.transform = `translate(${point.x - startCenterX}px, ${point.y - startCenterY}px) rotate(${angle}deg) scale(${scale})`;
      } else {
        const rotationTransform = rotate ? ` rotate(${rotation * progress}deg)` : "";
        element.style.transform = `translate(${point.x - startCenterX}px, ${point.y - startCenterY}px) scale(${scale})${rotationTransform}`;
      }
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

  function cubicBezierTangent(startX, startY, control1X, control1Y, control2X, control2Y, endX, endY, progress) {
    const inverse = 1 - progress;

    return {
      x: 3 * inverse * inverse * (control1X - startX)
        + 6 * inverse * progress * (control2X - control1X)
        + 3 * progress * progress * (endX - control2X),
      y: 3 * inverse * inverse * (control1Y - startY)
        + 6 * inverse * progress * (control2Y - control1Y)
        + 3 * progress * progress * (endY - control2Y),
    };
  }

  function easeInOutCubic(progress) {
    return progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - ((-2 * progress + 2) ** 3) / 2;
  }

  function easeInCubic(progress) {
    return progress * progress * progress;
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
    if (element._dropAnimation) {
      element._dropAnimation.cancel();
      delete element._dropAnimation;
    }

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
    element.style.removeProperty("z-index");
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

  function clearLightballFxState(tileId) {
    setLightballChargeState(tileId, false);
    setLightballFusionState(tileId, false);
    setLightballSelectedState(tileId, false);
  }

  function getSpecialTileLabel(type) {
    if (type === "windmill") {
      return "风车，";
    }

    if (type === "mergedWindmill") {
      return "大风车，";
    }

    if (type === "bomb") {
      return "炸弹，";
    }

    if (type === "hive") {
      return "光球，";
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

  function buildDropKeyframes(points) {
    if (points.length === 0) {
      return [];
    }

    if (points.length === 1) {
      return [{ left: `${points[0].left}px`, top: `${points[0].top}px` }];
    }

    const maxStep = Math.max(1, ...points.map((point, index) => point.step ?? index));
    const keyframes = [{ left: `${points[0].left}px`, top: `${points[0].top}px`, offset: 0 }];

    for (let index = 1; index < points.length; index += 1) {
      const previousPoint = points[index - 1];
      const currentPoint = points[index];
      const previousStep = previousPoint.step ?? index - 1;
      const currentStep = currentPoint.step ?? index;

      if (currentStep > previousStep) {
        keyframes.push({
          left: `${previousPoint.left}px`,
          top: `${previousPoint.top}px`,
          offset: Math.max(0, (currentStep - 1) / maxStep),
        });
      }

      keyframes.push({
        left: `${currentPoint.left}px`,
        top: `${currentPoint.top}px`,
        offset: Math.min(1, currentStep / maxStep),
      });
    }

    return keyframes;
  }

  return {
    clearAllTiles,
    clearBricks,
    burstTile,
    flyBee,
    flyLightballParticle,
    flyRewardToTile,
    flyTile,
    getTileElement,
    getTileRect,
    gustHitTile,
    animateDropPath,
    growTileIntoBoard,
    getBoardMetrics: getCurrentBoardMetrics,
    mergeTileIntoTile,
    mountSpawnedTile,
    orbitTilesIntoFusion,
    playBoardFlash,
    playBoardShockwave,
    showLightballFusionFocus,
    primeBombTile,
    playLightningLinks,
    playWindLines,
    pulseTile,
    playObstacleShatterEffects,
    mountTileForEntry,
    playBombExplosion,
    refreshBrickPositions,
    refreshTilePositions,
    renderBricks,
    popTile,
    clearLightballFxState,
    setLightballChargeState,
    setLightballFusionState,
    setLightballSelectedState,
    setWindmillFusionState,
    setDropDuration,
    setTileBoardPosition,
    shrinkTile,
    syncInteractivity,
    unmountTile,
    updateTile,
  };
}

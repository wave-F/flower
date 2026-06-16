const BOARD_COLUMNS = 5;
const BOARD_ROWS = 5;

const DEFAULT_SETTINGS = {
  autoplay: true,
  gustDuration: 520,
  loopDelay: 900,
  hitDelayRatio: 0.6,
  hitDuration: 280,
  widthScale: 1,
  curlScale: 1,
  spreadScale: 1,
  dustCount: 4,
  dustSizeScale: 1,
  dustWobbleScale: 1,
};

const settings = { ...DEFAULT_SETTINGS };

const stageElement = document.querySelector("#showcaseStage");
const boardFrameElement = document.querySelector("#showcaseBoardFrame");
const boardElement = document.querySelector("#showcaseBoard");
const overlayElement = document.querySelector("#showcaseOverlay");
const windmillElement = document.querySelector("#showcaseWindmill");
const playButton = document.querySelector("#playShowcaseButton");
const resetButton = document.querySelector("#resetShowcaseButton");
const autoplayToggle = document.querySelector("#autoplayToggle");
const writeBackButton = document.querySelector("#writeBackButton");
const writeBackStatus = document.querySelector("#writeBackStatus");
const targetElements = [...document.querySelectorAll(".showcase-target")];

const controls = {
  gustDuration: bindControl("gustDurationInput", "gustDurationValue", {
    read: (value) => Number(value),
    write: (value) => `${Math.round(value)}ms`,
  }),
  loopDelay: bindControl("loopDelayInput", "loopDelayValue", {
    read: (value) => Number(value),
    write: (value) => `${Math.round(value)}ms`,
  }),
  hitDelayRatio: bindControl("hitDelayRatioInput", "hitDelayRatioValue", {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
  }),
  hitDuration: bindControl("hitDurationInput", "hitDurationValue", {
    read: (value) => Number(value),
    write: (value) => `${Math.round(value)}ms`,
  }),
  widthScale: bindControl("widthScaleInput", "widthScaleValue", {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
  }),
  curlScale: bindControl("curlScaleInput", "curlScaleValue", {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
  }),
  spreadScale: bindControl("spreadScaleInput", "spreadScaleValue", {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
  }),
  dustCount: bindControl("dustCountInput", "dustCountValue", {
    read: (value) => Number(value),
    write: (value) => String(Math.round(value)),
  }),
  dustSizeScale: bindControl("dustSizeInput", "dustSizeValue", {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
  }),
  dustWobbleScale: bindControl("dustWobbleInput", "dustWobbleValue", {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
  }),
};

let gustIdSeed = 0;
let isPlaying = false;
let playRunId = 0;
let loopTimeoutId = 0;
let windmillConfigHandle = null;
const trackedTimeouts = new Set();

playButton?.addEventListener("click", () => {
  restartShowcase();
});

resetButton?.addEventListener("click", () => {
  stopPlayback();
  resetShowcase();
});

windmillElement?.addEventListener("click", () => {
  restartShowcase();
});

autoplayToggle?.addEventListener("change", () => {
  settings.autoplay = autoplayToggle.checked;
  if (settings.autoplay) {
    restartShowcase();
    return;
  }
  clearLoopTimeout();
});

writeBackButton?.addEventListener("click", () => {
  void writeBackToMainConfig();
});

Object.entries(controls).forEach(([key, control]) => {
  if (!control.inputElement) {
    return;
  }

  control.inputElement.addEventListener("input", () => {
    settings[key] = control.read(control.inputElement.value);
    control.outputElement.textContent = control.write(settings[key]);
    restartShowcase();
  });
});

window.addEventListener("load", () => {
  initializeBoard();
  applyControlValues();
  layoutBoardPieces();
  void playShowcase();
});

window.addEventListener("resize", () => {
  layoutBoardPieces();
});

function applyControlValues() {
  if (autoplayToggle) {
    autoplayToggle.checked = settings.autoplay;
  }

  Object.entries(controls).forEach(([key, control]) => {
    if (!control.inputElement || !control.outputElement) {
      return;
    }

    control.inputElement.value = String(control.serialize(settings[key]));
    control.outputElement.textContent = control.write(settings[key]);
  });
}

async function playShowcase() {
  if (!boardFrameElement || !overlayElement || !windmillElement) {
    return;
  }

  const runId = ++playRunId;
  isPlaying = true;
  playButton.disabled = true;
  resetShowcase();
  layoutBoardPieces();

  windmillElement.classList.add("is-charging");
  await wait(200);
  if (runId !== playRunId) {
    return;
  }

  windmillElement.classList.remove("is-charging");
  windmillElement.classList.add("is-spinning");

  const frameRect = boardFrameElement.getBoundingClientRect();
  const windmillRect = windmillElement.getBoundingClientRect();
  const from = toLocalCenter(windmillRect, frameRect);
  const gustPromises = targetElements.map((targetElement, index) => {
    const targetRect = targetElement.getBoundingClientRect();
    const to = toLocalCenter(targetRect, frameRect);
    const delay = index * 36;

    setTrackedTimeout(() => {
      if (runId !== playRunId) {
        return;
      }

      targetElement.classList.add("is-hit");
      animateTargetHit(targetElement, from, to, settings.hitDuration);
      setTrackedTimeout(() => {
        if (runId !== playRunId) {
          return;
        }
        targetElement.classList.add("is-cleared");
      }, 72);
    }, delay + settings.gustDuration * settings.hitDelayRatio);

    return Promise.all([
      spawnWindGust({ from, to, delay, duration: settings.gustDuration }),
      emitWindDust({ from, to, delay, duration: settings.gustDuration }),
    ]);
  });

  await Promise.all(gustPromises);
  if (runId !== playRunId) {
    return;
  }

  await wait(180);
  if (runId !== playRunId) {
    return;
  }

  windmillElement.classList.remove("is-spinning");
  isPlaying = false;
  playButton.disabled = false;

  if (settings.autoplay) {
    scheduleLoop();
  }
}

function restartShowcase() {
  stopPlayback();
  void playShowcase();
}

function stopPlayback() {
  playRunId += 1;
  isPlaying = false;
  playButton.disabled = false;
  clearLoopTimeout();
  clearTrackedTimeouts();
  resetShowcase();
}

function scheduleLoop() {
  clearLoopTimeout();
  loopTimeoutId = window.setTimeout(() => {
    loopTimeoutId = 0;
    void playShowcase();
  }, settings.loopDelay);
}

async function writeBackToMainConfig() {
  if (!window.showOpenFilePicker) {
    setWriteBackStatus("当前浏览器不支持直接写回本地文件，请改用 Chrome 最新版。", true);
    return;
  }

  try {
    writeBackButton.disabled = true;
    setWriteBackStatus("选择 `src/config/windmillTimings.js` 以写回参数...");
    if (!windmillConfigHandle) {
      [windmillConfigHandle] = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [{
          description: "JavaScript Config",
          accept: { "text/javascript": [".js"] },
        }],
      });
    }

    const file = await windmillConfigHandle.getFile();
    if (!file.name.endsWith("windmillTimings.js")) {
      setWriteBackStatus("选中的不是 `windmillTimings.js`，请重新点击按钮选择正确文件。", true);
      windmillConfigHandle = null;
      return;
    }

    const writable = await windmillConfigHandle.createWritable();
    await writable.write(buildWindmillTimingsSource());
    await writable.close();
    setWriteBackStatus("已写回主配置 `src/config/windmillTimings.js`。", false, true);
  } catch (error) {
    if (error?.name === "AbortError") {
      setWriteBackStatus("已取消写回。", true);
      return;
    }
    setWriteBackStatus(`写回失败：${error?.message ?? error}`, true);
  } finally {
    writeBackButton.disabled = false;
  }
}

function buildWindmillTimingsSource() {
  const config = {
    spinUpDuration: 200,
    burstDuration: Math.round(settings.gustDuration),
    windLineDuration: Math.round(settings.gustDuration),
    windLineStagger: 0,
    flowerFlyDuration: 1000,
    targetHitPulseDuration: Math.round(settings.hitDuration),
    windWidthScale: roundScale(settings.widthScale),
    windCurlScale: roundScale(settings.curlScale),
    windSpreadScale: roundScale(settings.spreadScale),
    windDustCount: Math.round(settings.dustCount),
    windDustSizeScale: roundScale(settings.dustSizeScale),
    windDustWobbleScale: roundScale(settings.dustWobbleScale),
    fadeDuration: 80,
  };

  return `export const WINDMILL_TIMINGS = ${JSON.stringify(config, null, 2)};\n\nexport function normalizeWindmillTimings(timings) {\n  const windLineDuration = normalizeDuration(timings.windLineDuration ?? timings.burstDuration, WINDMILL_TIMINGS.windLineDuration);\n  return {\n    spinUpDuration: normalizeDuration(timings.spinUpDuration, WINDMILL_TIMINGS.spinUpDuration),\n    burstDuration: windLineDuration,\n    windLineDuration,\n    windLineStagger: normalizeDelay(timings.windLineStagger, WINDMILL_TIMINGS.windLineStagger),\n    flowerFlyDuration: normalizeDuration(timings.flowerFlyDuration, WINDMILL_TIMINGS.flowerFlyDuration),\n    targetHitPulseDuration: normalizeDuration(timings.targetHitPulseDuration, WINDMILL_TIMINGS.targetHitPulseDuration),\n    windWidthScale: normalizeScale(timings.windWidthScale, WINDMILL_TIMINGS.windWidthScale),\n    windCurlScale: normalizeScale(timings.windCurlScale, WINDMILL_TIMINGS.windCurlScale),\n    windSpreadScale: normalizeScale(timings.windSpreadScale, WINDMILL_TIMINGS.windSpreadScale),\n    windDustCount: normalizeCount(timings.windDustCount, WINDMILL_TIMINGS.windDustCount),\n    windDustSizeScale: normalizeScale(timings.windDustSizeScale, WINDMILL_TIMINGS.windDustSizeScale),\n    windDustWobbleScale: normalizeScale(timings.windDustWobbleScale, WINDMILL_TIMINGS.windDustWobbleScale),\n    fadeDuration: normalizeDuration(timings.fadeDuration, WINDMILL_TIMINGS.fadeDuration),\n  };\n}\n\nexport function applyWindmillTimings(timings) {\n  const normalized = normalizeWindmillTimings(timings);\n  WINDMILL_TIMINGS.spinUpDuration = normalized.spinUpDuration;\n  WINDMILL_TIMINGS.burstDuration = normalized.burstDuration;\n  WINDMILL_TIMINGS.windLineDuration = normalized.windLineDuration;\n  WINDMILL_TIMINGS.windLineStagger = normalized.windLineStagger;\n  WINDMILL_TIMINGS.flowerFlyDuration = normalized.flowerFlyDuration;\n  WINDMILL_TIMINGS.targetHitPulseDuration = normalized.targetHitPulseDuration;\n  WINDMILL_TIMINGS.windWidthScale = normalized.windWidthScale;\n  WINDMILL_TIMINGS.windCurlScale = normalized.windCurlScale;\n  WINDMILL_TIMINGS.windSpreadScale = normalized.windSpreadScale;\n  WINDMILL_TIMINGS.windDustCount = normalized.windDustCount;\n  WINDMILL_TIMINGS.windDustSizeScale = normalized.windDustSizeScale;\n  WINDMILL_TIMINGS.windDustWobbleScale = normalized.windDustWobbleScale;\n  WINDMILL_TIMINGS.fadeDuration = normalized.fadeDuration;\n  return normalized;\n}\n\nfunction normalizeDuration(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(80, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeDelay(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeScale(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0.2, Math.min(3, Math.round(parsed * 100) / 100));\n}\n\nfunction normalizeCount(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(24, Math.round(parsed)));\n}\n`;
}

function setWriteBackStatus(message, isError = false, isSuccess = false) {
  if (!writeBackStatus) {
    return;
  }

  writeBackStatus.textContent = message;
  writeBackStatus.classList.toggle("is-error", isError);
  writeBackStatus.classList.toggle("is-success", isSuccess);
}

function roundScale(value) {
  return Math.round(value * 100) / 100;
}

function clearLoopTimeout() {
  if (loopTimeoutId) {
    window.clearTimeout(loopTimeoutId);
    loopTimeoutId = 0;
  }
}

function setTrackedTimeout(callback, delay) {
  const timeoutId = window.setTimeout(() => {
    trackedTimeouts.delete(timeoutId);
    callback();
  }, delay);
  trackedTimeouts.add(timeoutId);
  return timeoutId;
}

function clearTrackedTimeouts() {
  trackedTimeouts.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  trackedTimeouts.clear();
}

function resetShowcase() {
  overlayElement?.replaceChildren();
  targetElements.forEach((targetElement) => {
    targetElement.classList.remove("is-hit", "is-cleared");
    targetElement.getAnimations().forEach((animation) => animation.cancel());
    targetElement.style.removeProperty("transform");
  });
  windmillElement?.classList.remove("is-charging", "is-spinning");
  windmillElement?.getAnimations().forEach((animation) => animation.cancel());
  layoutBoardPieces();
}

function initializeBoard() {
  if (!boardElement || boardElement.childElementCount > 0) {
    return;
  }

  for (let index = 0; index < BOARD_COLUMNS * BOARD_ROWS; index += 1) {
    const slotElement = document.createElement("span");
    slotElement.className = "showcase-board-slot";
    boardElement.appendChild(slotElement);
  }
}

function layoutBoardPieces() {
  if (!boardElement || !boardFrameElement || !windmillElement) {
    return;
  }

  const boardRect = boardElement.getBoundingClientRect();
  const frameRect = boardFrameElement.getBoundingClientRect();
  const cellSize = boardRect.width / BOARD_COLUMNS;
  const offsetX = boardRect.left - frameRect.left;
  const offsetY = boardRect.top - frameRect.top;

  targetElements.forEach((targetElement) => {
    positionPiece(targetElement, cellSize, offsetX, offsetY);
  });

  positionPiece(windmillElement, cellSize, offsetX, offsetY, 1.08);
  boardFrameElement.style.setProperty("--showcase-cell-size", `${cellSize}px`);
}

function positionPiece(element, cellSize, offsetX, offsetY, scale = 0.92) {
  const column = Number(element.dataset.col);
  const row = Number(element.dataset.row);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return;
  }

  const centerX = offsetX + (column + 0.5) * cellSize;
  const centerY = offsetY + (row + 0.5) * cellSize;
  const size = Math.round(cellSize * scale);

  element.style.left = `${centerX}px`;
  element.style.top = `${centerY}px`;
  if (element === windmillElement) {
    element.style.setProperty("--windmill-size", `${size}px`);
  } else {
    element.style.setProperty("--piece-size", `${size}px`);
  }
}

function animateTargetHit(targetElement, from, to, duration) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  const push = 14;
  const settle = 5;
  const rotation = Math.max(-10, Math.min(10, directionX * 12));

  const animation = targetElement.animate([
    { transform: `${baseTargetTransform()} translate3d(0, 0, 0) rotate(0deg) scale(1)` },
    {
      transform: `${baseTargetTransform()} translate3d(${directionX * push}px, ${directionY * push}px, 0) rotate(${rotation}deg) scale(0.9, 1.08)`,
      offset: 0.34,
    },
    {
      transform: `${baseTargetTransform()} translate3d(${directionX * settle}px, ${directionY * settle}px, 0) rotate(${rotation * -0.28}deg) scale(1.02, 0.98)`,
      offset: 0.72,
    },
    { transform: `${baseTargetTransform()} translate3d(0, 0, 0) rotate(0deg) scale(1)` },
  ], {
    duration,
    easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
    fill: "both",
  });

  animation.finished.catch(() => {});
}

function spawnWindGust({ from, to, delay, duration }) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.hypot(deltaX, deltaY);
  const padding = Math.max(18, Math.min(42, length * 0.16));
  const width = Math.max(1, length + padding * 2);
  const height = Math.max(34, Math.min(72, length * 0.34));
  const angle = Math.atan2(deltaY, deltaX);
  const gustId = `showcase-gust-${gustIdSeed}`;
  gustIdSeed += 1;
  const gustElement = createSvgElement("svg");

  gustElement.classList.add("wind-gust");
  gustElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  gustElement.setAttribute("width", String(width));
  gustElement.setAttribute("height", String(height));
  gustElement.style.left = `${from.x - padding}px`;
  gustElement.style.top = `${from.y - height / 2}px`;
  gustElement.style.width = `${width}px`;
  gustElement.style.height = `${height}px`;
  gustElement.style.transform = `rotate(${angle}rad)`;
  gustElement.style.transformOrigin = `${padding}px ${height / 2}px`;
  gustElement.style.setProperty("--wind-line-duration", `${duration}ms`);
  gustElement.style.setProperty("--wind-line-delay", `${delay}ms`);

  appendBlurDef(gustElement, gustId);
  buildWindShapes({ length, padding, height }).forEach((shape) => {
    appendShape(gustElement, gustId, shape.softLayer);
    appendShape(gustElement, gustId, shape.mainLayer);
  });

  overlayElement.appendChild(gustElement);

  return new Promise((resolve) => {
    const cleanup = () => {
      gustElement.remove();
      resolve();
    };

    gustElement.addEventListener("animationend", cleanup, { once: true });
    setTrackedTimeout(cleanup, delay + duration + 140);
    requestAnimationFrame(() => {
      gustElement.classList.add("is-active");
    });
  });
}

function emitWindDust({ from, to, delay, duration }) {
  const particleCount = settings.dustCount;
  if (particleCount <= 0) {
    return Promise.resolve();
  }

  const promises = [];
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const normalX = -(deltaY / distance);
  const normalY = deltaX / distance;

  for (let index = 0; index < particleCount; index += 1) {
    promises.push(new Promise((resolve) => {
      const progressStep = particleCount > 1 ? index / (particleCount - 1) : 0.5;
      const startProgress = 0.08 + progressStep * 0.24;
      const endProgress = 0.7 + progressStep * 0.12;
      const wobble = Math.max(12, Math.min(28, distance * 0.12)) * settings.dustWobbleScale;
      const start = sampleCurvePoint(from, to, normalX, normalY, startProgress, wobble * (index % 2 === 0 ? 0.5 : -0.5));
      const end = sampleCurvePoint(from, to, normalX, normalY, Math.min(0.98, endProgress), wobble * (Math.random() - 0.5));
      const mote = document.createElement("span");
      const size = (8 + Math.random() * 6) * settings.dustSizeScale;

      mote.className = "wind-gust-mote";
      mote.style.width = `${size}px`;
      mote.style.height = `${size}px`;
      mote.style.left = `${start.x - size / 2}px`;
      mote.style.top = `${start.y - size / 2}px`;
      overlayElement.appendChild(mote);

      const animation = mote.animate([
        { opacity: 0, transform: "translate3d(0, 0, 0) scale(0.4)" },
        { opacity: 0.86, transform: `translate3d(${(end.x - start.x) * 0.38}px, ${(end.y - start.y) * 0.38}px, 0) scale(1.02)`, offset: 0.24 },
        { opacity: 0.4, transform: `translate3d(${(end.x - start.x) * 0.82}px, ${(end.y - start.y) * 0.82}px, 0) scale(0.92)`, offset: 0.74 },
        { opacity: 0, transform: `translate3d(${end.x - start.x}px, ${end.y - start.y}px, 0) scale(0.26)` },
      ], {
        duration: Math.round(duration * (0.4 + Math.random() * 0.18)),
        delay: delay + Math.round(duration * (0.12 + progressStep * 0.18)),
        easing: "cubic-bezier(0.22, 0.78, 0.22, 1)",
        fill: "both",
      });

      animation.finished.then(() => {
        animation.cancel();
        mote.remove();
        resolve();
      }).catch(() => {
        mote.remove();
        resolve();
      });
    }));
  }

  return Promise.all(promises);
}

function buildWindShapes({ length, padding, height }) {
  const centerY = height / 2;
  const arcBase = Math.max(8, Math.min(22, length * 0.1)) * settings.curlScale;
  const startX = padding;
  const endX = padding + length;
  const spread = settings.spreadScale;
  const widthScale = settings.widthScale;
  const descriptors = [
    {
      className: "wind-gust-shape--core",
      centerShift: -1 * spread,
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
      driftY: -2 * spread,
    },
    {
      className: "wind-gust-shape--upper",
      centerShift: -7 * spread,
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
      driftY: -4 * spread,
    },
    {
      className: "wind-gust-shape--lower",
      centerShift: 8 * spread,
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
      driftY: 4 * spread,
    },
  ];

  return descriptors.map((descriptor) => {
    const d = buildRibbonPath({ startX, endX, centerY, length, descriptor });
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

function buildRibbonPath({ startX, endX, centerY, length, descriptor }) {
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

function appendBlurDef(svgElement, gustId) {
  const defs = createSvgElement("defs");
  const filter = createSvgElement("filter");
  filter.setAttribute("id", `${gustId}-soft-blur`);
  filter.setAttribute("x", "-24%");
  filter.setAttribute("y", "-24%");
  filter.setAttribute("width", "148%");
  filter.setAttribute("height", "148%");
  const blur = createSvgElement("feGaussianBlur");
  blur.setAttribute("stdDeviation", "2.4");
  filter.appendChild(blur);
  defs.appendChild(filter);
  svgElement.appendChild(defs);
}

function appendShape(svgElement, gustId, shapeConfig) {
  const path = createSvgElement("path");
  path.classList.add("wind-gust-shape");
  shapeConfig.className.split(/\s+/).filter(Boolean).forEach((token) => path.classList.add(token));
  path.setAttribute("d", shapeConfig.d);
  if (shapeConfig.filterId) {
    path.setAttribute("filter", `url(#${gustId}-${shapeConfig.filterId})`);
  }
  path.style.setProperty("--wind-duration-scale", String(shapeConfig.durationScale));
  path.style.setProperty("--wind-drift-x", `${shapeConfig.driftX}px`);
  path.style.setProperty("--wind-drift-y", `${shapeConfig.driftY}px`);
  path.style.setProperty("--wind-settle-x", `${shapeConfig.driftX * 0.3}px`);
  path.style.setProperty("--wind-settle-y", `${shapeConfig.driftY * 0.3}px`);
  svgElement.appendChild(path);
}

function sampleCurvePoint(from, to, normalX, normalY, progress, wobble) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const curve = Math.sin(progress * Math.PI) * wobble;
  return {
    x: from.x + deltaX * progress + normalX * curve,
    y: from.y + deltaY * progress + normalY * curve,
  };
}

function baseTargetTransform() {
  return "translate(-50%, -50%)";
}

function toLocalCenter(rect, stageRect) {
  return {
    x: rect.left - stageRect.left + rect.width / 2,
    y: rect.top - stageRect.top + rect.height / 2,
  };
}

function createSvgElement(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function wait(duration) {
  return new Promise((resolve) => {
    setTrackedTimeout(resolve, duration);
  });
}

function bindControl(inputId, outputId, { read, write }) {
  const inputElement = document.querySelector(`#${inputId}`);
  const outputElement = document.querySelector(`#${outputId}`);

  return {
    inputElement,
    outputElement,
    read,
    write,
    serialize(value) {
      if (inputId.includes("Ratio") || inputId.includes("Scale")) {
        return Math.round(value * 100);
      }
      return value;
    },
  };
}

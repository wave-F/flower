const BOARD_COLUMNS = 5;
const BOARD_ROWS = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_SETTINGS = {
  windmill: {
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
  },
  lightball: {
    autoplay: true,
    orbitDuration: 670,
    loopDelay: 900,
    orbitSpeed: 2.54,
    stopDuration: 90,
    collisionDuration: 140,
    stopRadiusScale: 0.88,
    orbitStretchScale: 0.12,
    collisionPeakScale: 1.24,
    collisionEndScale: 0.22,
    focusOpacity: 0.86,
    focusFadeInDuration: 180,
    focusFadeOutDuration: 170,
    flashDuration: 340,
    shockwaveDuration: 1200,
    shockwaveSizeMultiplier: 9.4,
    shockwaveShakeStrength: 1.6,
  },
};

const EFFECT_META = {
  windmill: {
    label: "风车",
    configFileName: "windmillTimings.js",
    writeBackLabel: "写回主风车默认参数",
  },
  lightball: {
    label: "双光球",
    configFileName: "lightballTimings.js",
    writeBackLabel: "写回主双光球默认参数",
  },
};

const settings = {
  windmill: { ...DEFAULT_SETTINGS.windmill },
  lightball: { ...DEFAULT_SETTINGS.lightball },
};

const stageElement = document.querySelector("#showcaseStage");
const boardFrameElement = document.querySelector("#showcaseBoardFrame");
const boardElement = document.querySelector("#showcaseBoard");
const overlayElement = document.querySelector("#showcaseOverlay");
const playButton = document.querySelector("#playShowcaseButton");
const resetButton = document.querySelector("#resetShowcaseButton");
const autoplayToggle = document.querySelector("#autoplayToggle");
const writeBackButton = document.querySelector("#writeBackButton");
const writeBackStatus = document.querySelector("#writeBackStatus");
const tabButtons = [...document.querySelectorAll(".showcase-tab")];

const scenes = {
  windmill: document.querySelector("#showcaseWindmillScene"),
  lightball: document.querySelector("#showcaseLightballScene"),
};

const windmillElement = document.querySelector("#showcaseWindmill");
const targetElements = [...document.querySelectorAll("#showcaseWindmillScene .showcase-target")];
const lightballPrimaryElement = document.querySelector("#showcaseLightballPrimary");
const lightballSecondaryElement = document.querySelector("#showcaseLightballSecondary");

const controlGroups = {
  windmill: {
    panelElement: document.querySelector("#windmillDebugPanel"),
    controls: {
      gustDuration: bindControl("gustDurationInput", "gustDurationValue", numberControl("ms")),
      loopDelay: bindControl("loopDelayInput", "loopDelayValue", numberControl("ms")),
      hitDelayRatio: bindControl("hitDelayRatioInput", "hitDelayRatioValue", ratioControl()),
      hitDuration: bindControl("hitDurationInput", "hitDurationValue", numberControl("ms")),
      widthScale: bindControl("widthScaleInput", "widthScaleValue", scaleControl("%")),
      curlScale: bindControl("curlScaleInput", "curlScaleValue", scaleControl("%")),
      spreadScale: bindControl("spreadScaleInput", "spreadScaleValue", scaleControl("%")),
      dustCount: bindControl("dustCountInput", "dustCountValue", integerControl()),
      dustSizeScale: bindControl("dustSizeInput", "dustSizeValue", scaleControl("%")),
      dustWobbleScale: bindControl("dustWobbleInput", "dustWobbleValue", scaleControl("%")),
    },
  },
  lightball: {
    panelElement: document.querySelector("#lightballDebugPanel"),
    controls: {
      orbitDuration: bindControl("lightballOrbitDurationInput", "lightballOrbitDurationValue", numberControl("ms")),
      loopDelay: bindControl("lightballLoopDelayInput", "lightballLoopDelayValue", numberControl("ms")),
      orbitSpeed: bindControl("lightballOrbitSpeedInput", "lightballOrbitSpeedValue", {
        read: (value) => Number(value) / 100,
        write: (value) => `${roundScale(value)} 圈/秒`,
        serialize: (value) => Math.round(value * 100),
      }),
      stopDuration: bindControl("lightballStopDurationInput", "lightballStopDurationValue", numberControl("ms")),
      collisionDuration: bindControl("lightballCollisionDurationInput", "lightballCollisionDurationValue", numberControl("ms")),
      stopRadiusScale: bindControl("lightballStopRadiusScaleInput", "lightballStopRadiusScaleValue", scaleControl("%")),
      orbitStretchScale: bindControl("lightballOrbitStretchScaleInput", "lightballOrbitStretchScaleValue", scaleControl("%")),
      collisionPeakScale: bindControl("lightballCollisionPeakScaleInput", "lightballCollisionPeakScaleValue", scaleControl("%")),
      collisionEndScale: bindControl("lightballCollisionEndScaleInput", "lightballCollisionEndScaleValue", scaleControl("%")),
      focusOpacity: bindControl("lightballFocusOpacityInput", "lightballFocusOpacityValue", scaleControl("%")),
      focusFadeInDuration: bindControl("lightballFocusFadeInDurationInput", "lightballFocusFadeInDurationValue", numberControl("ms")),
      focusFadeOutDuration: bindControl("lightballFocusFadeOutDurationInput", "lightballFocusFadeOutDurationValue", numberControl("ms")),
      flashDuration: bindControl("lightballFlashDurationInput", "lightballFlashDurationValue", numberControl("ms")),
      shockwaveDuration: bindControl("lightballShockwaveDurationInput", "lightballShockwaveDurationValue", numberControl("ms")),
      shockwaveSizeMultiplier: bindControl("lightballShockwaveSizeMultiplierInput", "lightballShockwaveSizeMultiplierValue", {
        read: (value) => Number(value) / 10,
        write: (value) => `${roundScale(value)}x`,
        serialize: (value) => Math.round(value * 10),
      }),
      shockwaveShakeStrength: bindControl("lightballShockwaveShakeStrengthInput", "lightballShockwaveShakeStrengthValue", {
        read: (value) => Number(value) / 100,
        write: (value) => String(roundScale(value)),
        serialize: (value) => Math.round(value * 100),
      }),
    },
  },
};

let activeEffectKey = "windmill";
let gustIdSeed = 0;
let isPlaying = false;
let playRunId = 0;
let loopTimeoutId = 0;
const trackedTimeouts = new Set();
const trackedFrames = new Set();
const configHandles = {
  windmill: null,
  lightball: null,
};

playButton?.addEventListener("click", () => {
  restartShowcase();
});

resetButton?.addEventListener("click", () => {
  stopPlayback();
  resetShowcase();
});

windmillElement?.addEventListener("click", () => {
  if (activeEffectKey === "windmill") {
    restartShowcase();
  }
});

lightballPrimaryElement?.addEventListener("click", () => {
  if (activeEffectKey === "lightball") {
    restartShowcase();
  }
});

lightballSecondaryElement?.addEventListener("click", () => {
  if (activeEffectKey === "lightball") {
    restartShowcase();
  }
});

autoplayToggle?.addEventListener("change", () => {
  settings[activeEffectKey].autoplay = autoplayToggle.checked;
  if (autoplayToggle.checked) {
    restartShowcase();
    return;
  }
  clearLoopTimeout();
});

writeBackButton?.addEventListener("click", () => {
  void writeBackToMainConfig();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextEffectKey = button.dataset.tab;
    if (!nextEffectKey || nextEffectKey === activeEffectKey) {
      return;
    }

    switchEffect(nextEffectKey);
  });
});

Object.entries(controlGroups).forEach(([effectKey, group]) => {
  Object.entries(group.controls).forEach(([settingKey, control]) => {
    if (!control.inputElement) {
      return;
    }

    control.inputElement.addEventListener("input", () => {
      settings[effectKey][settingKey] = control.read(control.inputElement.value);
      control.outputElement.textContent = control.write(settings[effectKey][settingKey]);
      if (effectKey === activeEffectKey) {
        restartShowcase();
      }
    });
  });
});

window.addEventListener("load", () => {
  initializeBoard();
  applyAllControlValues();
  syncActiveEffectUi();
  layoutBoardPieces();
  void playShowcase();
});

window.addEventListener("resize", () => {
  layoutBoardPieces();
});

function switchEffect(nextEffectKey) {
  stopPlayback();
  activeEffectKey = nextEffectKey;
  syncActiveEffectUi();
  resetShowcase();
  layoutBoardPieces();
  if (settings[activeEffectKey].autoplay) {
    void playShowcase();
  }
}

function syncActiveEffectUi() {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === activeEffectKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  Object.entries(scenes).forEach(([effectKey, sceneElement]) => {
    sceneElement?.classList.toggle("showcase-scene--active", effectKey === activeEffectKey);
    sceneElement?.classList.toggle("showcase-scene--hidden", effectKey !== activeEffectKey);
  });

  Object.entries(controlGroups).forEach(([effectKey, group]) => {
    group.panelElement?.classList.toggle("debug-grid--active", effectKey === activeEffectKey);
    group.panelElement?.classList.toggle("debug-grid--hidden", effectKey !== activeEffectKey);
  });

  if (autoplayToggle) {
    autoplayToggle.checked = settings[activeEffectKey].autoplay;
  }

  if (writeBackButton) {
    writeBackButton.textContent = EFFECT_META[activeEffectKey].writeBackLabel;
  }

  setWriteBackStatus("未写回");
}

function applyAllControlValues() {
  Object.entries(controlGroups).forEach(([effectKey, group]) => {
    Object.entries(group.controls).forEach(([settingKey, control]) => {
      if (!control.inputElement || !control.outputElement) {
        return;
      }

      control.inputElement.value = String(control.serialize(settings[effectKey][settingKey]));
      control.outputElement.textContent = control.write(settings[effectKey][settingKey]);
    });
  });
}

async function playShowcase() {
  if (!boardFrameElement || !overlayElement) {
    return;
  }

  const runId = ++playRunId;
  isPlaying = true;
  if (playButton) {
    playButton.disabled = true;
  }
  resetShowcase();
  layoutBoardPieces();

  if (activeEffectKey === "windmill") {
    await playWindmillShowcase(runId);
    return;
  }

  await playLightballShowcase(runId);
}

async function playWindmillShowcase(runId) {
  if (!boardFrameElement || !windmillElement) {
    finishPlayback(runId);
    return;
  }

  const current = settings.windmill;
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
      animateTargetHit(targetElement, from, to, current.hitDuration);
      setTrackedTimeout(() => {
        if (runId !== playRunId) {
          return;
        }
        targetElement.classList.add("is-cleared");
      }, 72);
    }, delay + current.gustDuration * current.hitDelayRatio);

    return Promise.all([
      spawnWindGust({ from, to, delay, duration: current.gustDuration, settings: current }),
      emitWindDust({ from, to, delay, duration: current.gustDuration, settings: current }),
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
  finishPlayback(runId);
}

async function playLightballShowcase(runId) {
  if (!boardFrameElement || !lightballPrimaryElement || !lightballSecondaryElement) {
    finishPlayback(runId);
    return;
  }

  const current = settings.lightball;
  lightballPrimaryElement.classList.add("is-fusing");
  lightballSecondaryElement.classList.add("is-fusing");
  const focusOverlay = showLightballFusionFocus(current);
  const impact = await orbitAndCollideLightballs({
    primaryElement: lightballPrimaryElement,
    secondaryElement: lightballSecondaryElement,
    settings: current,
    runId,
  });

  if (runId !== playRunId || !impact) {
    return;
  }

  lightballPrimaryElement.classList.remove("is-fusing");
  lightballSecondaryElement.classList.remove("is-fusing");

  await Promise.all([
    focusOverlay.dismiss(),
    playImpactFlash(impact, current.flashDuration),
    playImpactShockwave(impact, current),
    playImpactFlare(impact, current),
  ]);

  if (runId !== playRunId) {
    return;
  }

  finishPlayback(runId);
}

function finishPlayback(runId) {
  if (runId !== playRunId) {
    return;
  }

  isPlaying = false;
  if (playButton) {
    playButton.disabled = false;
  }
  if (settings[activeEffectKey].autoplay) {
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
  if (playButton) {
    playButton.disabled = false;
  }
  clearLoopTimeout();
  clearTrackedTimeouts();
  clearTrackedFrames();
  resetShowcase();
}

function scheduleLoop() {
  clearLoopTimeout();
  loopTimeoutId = window.setTimeout(() => {
    loopTimeoutId = 0;
    void playShowcase();
  }, settings[activeEffectKey].loopDelay);
}

async function writeBackToMainConfig() {
  const effectKey = activeEffectKey;
  const meta = EFFECT_META[effectKey];
  const payload = {
    effectKey,
    settings: effectKey === "windmill" ? buildWindmillWritebackPayload() : buildLightballWritebackPayload(),
  };

  try {
    if (writeBackButton) {
      writeBackButton.disabled = true;
    }
    setWriteBackStatus(`正在写回 \`src/config/${meta.configFileName}\` ...`);
    const response = await fetch("http://127.0.0.1:3210/api/write-effect-defaults", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ ok: false, message: "Invalid server response." }));
    if (!response.ok || !result.ok) {
      setWriteBackStatus(`写回失败：${result.message ?? response.statusText}`, true);
      return;
    }
    setWriteBackStatus(`已写回主配置 \`src/config/${meta.configFileName}\`。`, false, true);
  } catch (error) {
    setWriteBackStatus(`写回失败：${error?.message ?? error}`, true);
  } finally {
    if (writeBackButton) {
      writeBackButton.disabled = false;
    }
  }
}

function buildWindmillWritebackPayload() {
  const current = settings.windmill;
  return {
    spinUpDuration: 200,
    gustDuration: Math.round(current.gustDuration),
    hitDuration: Math.round(current.hitDuration),
    widthScale: roundScale(current.widthScale),
    curlScale: roundScale(current.curlScale),
    spreadScale: roundScale(current.spreadScale),
    dustCount: Math.round(current.dustCount),
    dustSizeScale: roundScale(current.dustSizeScale),
    dustWobbleScale: roundScale(current.dustWobbleScale),
  };
}

function buildLightballWritebackPayload() {
  const current = settings.lightball;
  return {
    orbitDuration: Math.round(current.orbitDuration),
    orbitSpeed: roundScale(current.orbitSpeed),
    stopDuration: Math.round(current.stopDuration),
    collisionDuration: Math.round(current.collisionDuration),
    collisionPeakScale: roundScale(current.collisionPeakScale),
    collisionEndScale: roundScale(current.collisionEndScale),
    stopRadiusScale: roundScale(current.stopRadiusScale),
    orbitStretchScale: roundScale(current.orbitStretchScale),
    focusOpacity: roundScale(current.focusOpacity),
    focusFadeInDuration: Math.round(current.focusFadeInDuration),
    focusFadeOutDuration: Math.round(current.focusFadeOutDuration),
    flashDuration: Math.round(current.flashDuration),
    shockwaveDuration: Math.round(current.shockwaveDuration),
    shockwaveSizeMultiplier: roundScale(current.shockwaveSizeMultiplier),
    shockwaveShakeStrength: roundScale(current.shockwaveShakeStrength),
  };
}

function buildWindmillTimingsSource() {
  const current = settings.windmill;
  const config = {
    spinUpDuration: 200,
    burstDuration: Math.round(current.gustDuration),
    windLineDuration: Math.round(current.gustDuration),
    windLineStagger: 0,
    flowerFlyDuration: 1000,
    targetHitPulseDuration: Math.round(current.hitDuration),
    windWidthScale: roundScale(current.widthScale),
    windCurlScale: roundScale(current.curlScale),
    windSpreadScale: roundScale(current.spreadScale),
    windDustCount: Math.round(current.dustCount),
    windDustSizeScale: roundScale(current.dustSizeScale),
    windDustWobbleScale: roundScale(current.dustWobbleScale),
    fadeDuration: 80,
  };

  return `export const WINDMILL_TIMINGS = ${JSON.stringify(config, null, 2)};\n\nexport function normalizeWindmillTimings(timings) {\n  const windLineDuration = normalizeDuration(timings.windLineDuration ?? timings.burstDuration, WINDMILL_TIMINGS.windLineDuration);\n  return {\n    spinUpDuration: normalizeDuration(timings.spinUpDuration, WINDMILL_TIMINGS.spinUpDuration),\n    burstDuration: windLineDuration,\n    windLineDuration,\n    windLineStagger: normalizeDelay(timings.windLineStagger, WINDMILL_TIMINGS.windLineStagger),\n    flowerFlyDuration: normalizeDuration(timings.flowerFlyDuration, WINDMILL_TIMINGS.flowerFlyDuration),\n    targetHitPulseDuration: normalizeDuration(timings.targetHitPulseDuration, WINDMILL_TIMINGS.targetHitPulseDuration),\n    windWidthScale: normalizeScale(timings.windWidthScale, WINDMILL_TIMINGS.windWidthScale),\n    windCurlScale: normalizeScale(timings.windCurlScale, WINDMILL_TIMINGS.windCurlScale),\n    windSpreadScale: normalizeScale(timings.windSpreadScale, WINDMILL_TIMINGS.windSpreadScale),\n    windDustCount: normalizeCount(timings.windDustCount, WINDMILL_TIMINGS.windDustCount),\n    windDustSizeScale: normalizeScale(timings.windDustSizeScale, WINDMILL_TIMINGS.windDustSizeScale),\n    windDustWobbleScale: normalizeScale(timings.windDustWobbleScale, WINDMILL_TIMINGS.windDustWobbleScale),\n    fadeDuration: normalizeDuration(timings.fadeDuration, WINDMILL_TIMINGS.fadeDuration),\n  };\n}\n\nexport function applyWindmillTimings(timings) {\n  const normalized = normalizeWindmillTimings(timings);\n  Object.assign(WINDMILL_TIMINGS, normalized);\n  return normalized;\n}\n\nfunction normalizeDuration(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(80, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeDelay(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeScale(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0.2, Math.min(3, Math.round(parsed * 100) / 100));\n}\n\nfunction normalizeCount(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(24, Math.round(parsed)));\n}\n`;
}

function buildLightballTimingsSource() {
  const current = settings.lightball;
  const config = {
    orbitDuration: Math.round(current.orbitDuration),
    orbitSpeed: roundScale(current.orbitSpeed),
    orbitEndScale: 0.98,
    stopDuration: Math.round(current.stopDuration),
    collisionDuration: Math.round(current.collisionDuration),
    collisionPeakScale: roundScale(current.collisionPeakScale),
    collisionEndScale: roundScale(current.collisionEndScale),
    collisionFadeStart: 0.8,
    stopRadiusScale: roundScale(current.stopRadiusScale),
    orbitStretchScale: roundScale(current.orbitStretchScale),
    focusOpacity: roundScale(current.focusOpacity),
    focusFadeInDuration: Math.round(current.focusFadeInDuration),
    focusFadeOutDuration: Math.round(current.focusFadeOutDuration),
    flareDuration: 220,
    flashDuration: Math.round(current.flashDuration),
    shockwaveDuration: Math.round(current.shockwaveDuration),
    shockwaveSizeMultiplier: roundScale(current.shockwaveSizeMultiplier),
    shockwaveShakeStrength: roundScale(current.shockwaveShakeStrength),
    popDuration: 180,
    waveStagger: 14,
  };

  return `export const DUAL_LIGHTBALL_TIMINGS = ${JSON.stringify(config, null, 2)};\n\nexport function normalizeDualLightballTimings(timings) {\n  const orbitDuration = normalizeDuration(timings.orbitDuration, DUAL_LIGHTBALL_TIMINGS.orbitDuration);\n  const derivedOrbitSpeed = Number.isFinite(Number(timings.orbitSpeed))\n    ? Number(timings.orbitSpeed)\n    : Number.isFinite(Number(timings.turns))\n      ? Number(timings.turns) / Math.max(0.1, orbitDuration / 1000)\n      : DUAL_LIGHTBALL_TIMINGS.orbitSpeed;\n\n  return {\n    orbitDuration,\n    orbitSpeed: normalizeScale(derivedOrbitSpeed, DUAL_LIGHTBALL_TIMINGS.orbitSpeed, 0.1, 12),\n    orbitEndScale: normalizeScale(timings.orbitEndScale, DUAL_LIGHTBALL_TIMINGS.orbitEndScale, 0.2, 3),\n    stopDuration: normalizeDelay(timings.stopDuration, DUAL_LIGHTBALL_TIMINGS.stopDuration),\n    collisionDuration: normalizeDuration(timings.collisionDuration, DUAL_LIGHTBALL_TIMINGS.collisionDuration),\n    collisionPeakScale: normalizeScale(timings.collisionPeakScale, DUAL_LIGHTBALL_TIMINGS.collisionPeakScale, 0.2, 3),\n    collisionEndScale: normalizeScale(timings.collisionEndScale, DUAL_LIGHTBALL_TIMINGS.collisionEndScale, 0.05, 2),\n    collisionFadeStart: normalizeScale(timings.collisionFadeStart, DUAL_LIGHTBALL_TIMINGS.collisionFadeStart, 0.1, 0.98),\n    stopRadiusScale: normalizeScale(timings.stopRadiusScale, DUAL_LIGHTBALL_TIMINGS.stopRadiusScale, 0.2, 1),\n    orbitStretchScale: normalizeScale(timings.orbitStretchScale, DUAL_LIGHTBALL_TIMINGS.orbitStretchScale, 0, 1),\n    focusOpacity: normalizeScale(timings.focusOpacity, DUAL_LIGHTBALL_TIMINGS.focusOpacity, 0, 1),\n    focusFadeInDuration: normalizeDuration(timings.focusFadeInDuration, DUAL_LIGHTBALL_TIMINGS.focusFadeInDuration),\n    focusFadeOutDuration: normalizeDuration(timings.focusFadeOutDuration, DUAL_LIGHTBALL_TIMINGS.focusFadeOutDuration),\n    flareDuration: normalizeDuration(timings.flareDuration, DUAL_LIGHTBALL_TIMINGS.flareDuration),\n    flashDuration: normalizeDuration(timings.flashDuration, DUAL_LIGHTBALL_TIMINGS.flashDuration),\n    shockwaveDuration: normalizeDuration(timings.shockwaveDuration, DUAL_LIGHTBALL_TIMINGS.shockwaveDuration),\n    shockwaveSizeMultiplier: normalizeScale(timings.shockwaveSizeMultiplier, DUAL_LIGHTBALL_TIMINGS.shockwaveSizeMultiplier, 1, 20),\n    shockwaveShakeStrength: normalizeScale(timings.shockwaveShakeStrength, DUAL_LIGHTBALL_TIMINGS.shockwaveShakeStrength, 0, 5),\n    popDuration: normalizeDuration(timings.popDuration, DUAL_LIGHTBALL_TIMINGS.popDuration),\n    waveStagger: normalizeDelay(timings.waveStagger, DUAL_LIGHTBALL_TIMINGS.waveStagger),\n  };\n}\n\nexport function applyDualLightballTimings(timings) {\n  const normalized = normalizeDualLightballTimings(timings);\n  Object.assign(DUAL_LIGHTBALL_TIMINGS, normalized);\n  return normalized;\n}\n\nfunction normalizeDuration(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(40, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeDelay(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeScale(value, fallback, min = 0.2, max = 3) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(min, Math.min(max, Math.round(parsed * 100) / 100));\n}\n`;
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

function requestTrackedFrame(callback) {
  const frameId = window.requestAnimationFrame((timestamp) => {
    trackedFrames.delete(frameId);
    callback(timestamp);
  });
  trackedFrames.add(frameId);
  return frameId;
}

function clearTrackedFrames() {
  trackedFrames.forEach((frameId) => {
    window.cancelAnimationFrame(frameId);
  });
  trackedFrames.clear();
}

function resetShowcase() {
  overlayElement?.replaceChildren();

  targetElements.forEach((targetElement) => {
    targetElement.classList.remove("is-hit", "is-cleared");
    targetElement.getAnimations().forEach((animation) => animation.cancel());
    targetElement.style.removeProperty("transform");
  });

  [windmillElement, lightballPrimaryElement, lightballSecondaryElement].forEach((element) => {
    element?.classList.remove("is-charging", "is-spinning", "is-fusing");
    element?.getAnimations().forEach((animation) => animation.cancel());
    if (!element) {
      return;
    }
    element.style.removeProperty("transform");
    element.style.removeProperty("opacity");
    element.style.removeProperty("z-index");
  });

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
  if (!boardElement || !boardFrameElement) {
    return;
  }

  const boardRect = boardElement.getBoundingClientRect();
  const frameRect = boardFrameElement.getBoundingClientRect();
  const cellSize = boardRect.width / BOARD_COLUMNS;
  const offsetX = boardRect.left - frameRect.left;
  const offsetY = boardRect.top - frameRect.top;

  targetElements.forEach((targetElement) => {
    positionPiece(targetElement, cellSize, offsetX, offsetY, 0.92, "--piece-size");
  });
  positionPiece(windmillElement, cellSize, offsetX, offsetY, 1.08, "--windmill-size");
  positionPiece(lightballPrimaryElement, cellSize, offsetX, offsetY, 0.94, "--lightball-size");
  positionPiece(lightballSecondaryElement, cellSize, offsetX, offsetY, 0.94, "--lightball-size");
  boardFrameElement.style.setProperty("--showcase-cell-size", `${cellSize}px`);
}

function positionPiece(element, cellSize, offsetX, offsetY, scale, sizeVarName) {
  if (!element) {
    return;
  }

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
  element.style.setProperty(sizeVarName, `${size}px`);
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
    { transform: `${baseTargetTransform()} translate3d(${directionX * push}px, ${directionY * push}px, 0) rotate(${rotation}deg) scale(0.9, 1.08)`, offset: 0.34 },
    { transform: `${baseTargetTransform()} translate3d(${directionX * settle}px, ${directionY * settle}px, 0) rotate(${rotation * -0.28}deg) scale(1.02, 0.98)`, offset: 0.72 },
    { transform: `${baseTargetTransform()} translate3d(0, 0, 0) rotate(0deg) scale(1)` },
  ], {
    duration,
    easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
    fill: "both",
  });

  animation.finished.catch(() => {});
}

function spawnWindGust({ from, to, delay, duration, settings: windSettings }) {
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
  buildWindShapes({ length, padding, height, settings: windSettings }).forEach((shape) => {
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
    requestTrackedFrame(() => {
      gustElement.classList.add("is-active");
    });
  });
}

function emitWindDust({ from, to, delay, duration, settings: windSettings }) {
  const particleCount = windSettings.dustCount;
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
      const wobble = Math.max(12, Math.min(28, distance * 0.12)) * windSettings.dustWobbleScale;
      const start = sampleCurvePoint(from, to, normalX, normalY, startProgress, wobble * (index % 2 === 0 ? 0.5 : -0.5));
      const end = sampleCurvePoint(from, to, normalX, normalY, Math.min(0.98, endProgress), wobble * (Math.random() - 0.5));
      const mote = document.createElement("span");
      const size = (8 + Math.random() * 6) * windSettings.dustSizeScale;

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

function buildWindShapes({ length, padding, height, settings: windSettings }) {
  const centerY = height / 2;
  const arcBase = Math.max(8, Math.min(22, length * 0.1)) * windSettings.curlScale;
  const startX = padding;
  const endX = padding + length;
  const spread = windSettings.spreadScale;
  const widthScale = windSettings.widthScale;
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

function orbitAndCollideLightballs({ primaryElement, secondaryElement, settings: lightballSettings, runId }) {
  if (!boardFrameElement || !primaryElement || !secondaryElement) {
    return Promise.resolve(null);
  }

  const frameRect = boardFrameElement.getBoundingClientRect();
  const primaryRect = primaryElement.getBoundingClientRect();
  const secondaryRect = secondaryElement.getBoundingClientRect();
  const primaryStart = toLocalCenter(primaryRect, frameRect);
  const secondaryStart = toLocalCenter(secondaryRect, frameRect);
  const center = {
    x: (primaryStart.x + secondaryStart.x) / 2,
    y: (primaryStart.y + secondaryStart.y) / 2,
  };
  const primaryStartAngle = Math.atan2(primaryStart.y - center.y, primaryStart.x - center.x);
  const secondaryStartAngle = Math.atan2(secondaryStart.y - center.y, secondaryStart.x - center.x);
  const primaryRadius = Math.hypot(primaryStart.x - center.x, primaryStart.y - center.y);
  const secondaryRadius = Math.hypot(secondaryStart.x - center.x, secondaryStart.y - center.y);
  const totalAngle = Math.PI * 2 * lightballSettings.orbitSpeed * (lightballSettings.orbitDuration / 1000);

  return new Promise((resolve) => {
    let lastAngleOffset = 0;
    let lastPrimaryRadius = primaryRadius;
    let lastSecondaryRadius = secondaryRadius;
    let lastScale = 1;
    let stopTimer = 0;

    const updatePose = (element, angle, radius, scale, opacity) => {
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      element.style.transform = `translate(-50%, -50%) scale(${scale})`;
      element.style.opacity = String(opacity);
      element.style.zIndex = "8";
    };

    const finish = () => {
      window.clearTimeout(stopTimer);
      primaryElement.style.opacity = "0";
      secondaryElement.style.opacity = "0";
      primaryElement.style.transform = "translate(-50%, -50%) scale(0.24)";
      secondaryElement.style.transform = "translate(-50%, -50%) scale(0.24)";
      primaryElement.style.removeProperty("z-index");
      secondaryElement.style.removeProperty("z-index");
      resolve({ center, baseSize: Math.max(primaryRect.width, primaryRect.height) });
    };

    const startCollision = () => {
      const collisionStart = performance.now();
      const collideStep = (now) => {
        if (runId !== playRunId) {
          resolve(null);
          return;
        }

        const rawProgress = Math.min(1, (now - collisionStart) / lightballSettings.collisionDuration);
        const progress = easeInCubic(rawProgress);
        const primaryCurrentRadius = lerp(lastPrimaryRadius, 0, progress);
        const secondaryCurrentRadius = lerp(lastSecondaryRadius, 0, progress);
        const peakBoundary = 0.66;
        const peakScale = lightballSettings.collisionPeakScale;
        const endScale = lightballSettings.collisionEndScale;
        const scale = rawProgress < peakBoundary
          ? lerp(lastScale, peakScale, rawProgress / peakBoundary)
          : lerp(peakScale, endScale, (rawProgress - peakBoundary) / (1 - peakBoundary));
        const opacity = rawProgress < 0.8 ? 1 : Math.max(0, 1 - (rawProgress - 0.8) / 0.2);

        updatePose(primaryElement, primaryStartAngle + lastAngleOffset, primaryCurrentRadius, scale, opacity);
        updatePose(secondaryElement, secondaryStartAngle + lastAngleOffset, secondaryCurrentRadius, scale, opacity);

        if (rawProgress >= 1) {
          finish();
          return;
        }

        requestTrackedFrame(collideStep);
      };

      requestTrackedFrame(collideStep);
    };

    const orbitStart = performance.now();
    const orbitStep = (now) => {
      if (runId !== playRunId) {
        resolve(null);
        return;
      }

      const rawProgress = Math.min(1, (now - orbitStart) / lightballSettings.orbitDuration);
      const progress = easeInOutCubic(rawProgress);
      const angleOffset = totalAngle * rawProgress;
      const radiusProgress = easeInOutCubic(rawProgress);
      const primaryCurrentRadius = lerp(primaryRadius, primaryRadius * lightballSettings.stopRadiusScale, radiusProgress);
      const secondaryCurrentRadius = lerp(secondaryRadius, secondaryRadius * lightballSettings.stopRadiusScale, radiusProgress);
      const baseScale = lerp(1, 0.98, progress);
      const scale = baseScale * (1 + Math.sin(progress * Math.PI) * lightballSettings.orbitStretchScale);

      lastAngleOffset = angleOffset;
      lastPrimaryRadius = primaryCurrentRadius;
      lastSecondaryRadius = secondaryCurrentRadius;
      lastScale = scale;

      updatePose(primaryElement, primaryStartAngle + angleOffset, primaryCurrentRadius, scale, 1);
      updatePose(secondaryElement, secondaryStartAngle + angleOffset, secondaryCurrentRadius, scale, 1);

      if (rawProgress >= 1) {
        stopTimer = window.setTimeout(startCollision, lightballSettings.stopDuration);
        return;
      }

      requestTrackedFrame(orbitStep);
    };

    requestTrackedFrame(orbitStep);
  });
}

function showLightballFusionFocus(lightballSettings) {
  const focusElement = document.createElement("span");
  focusElement.className = "lightball-focus-overlay";
  focusElement.style.opacity = "0";
  overlayElement.appendChild(focusElement);

  const fadeInAnimation = focusElement.animate([
    { opacity: 0 },
    { opacity: lightballSettings.focusOpacity },
  ], {
    duration: lightballSettings.focusFadeInDuration,
    easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
    fill: "forwards",
  });

  return {
    dismiss() {
      return new Promise((resolve) => {
        fadeInAnimation.finished.catch(() => undefined).finally(() => {
          if (!focusElement.isConnected) {
            resolve();
            return;
          }

          const fadeOutAnimation = focusElement.animate([
            { opacity: lightballSettings.focusOpacity },
            { opacity: 0 },
          ], {
            duration: lightballSettings.focusFadeOutDuration,
            easing: "cubic-bezier(0.36, 0, 0.2, 1)",
            fill: "forwards",
          });

          fadeOutAnimation.finished.then(() => {
            fadeOutAnimation.cancel();
            focusElement.remove();
            resolve();
          }).catch(() => {
            focusElement.remove();
            resolve();
          });
        });
      });
    },
  };
}

function playImpactFlare(impact, lightballSettings) {
  const size = impact.baseSize * 2.2;
  return playOverlayCircle("lightball-impact-flash", impact.center, size, [
    { opacity: 0, transform: "translate(-50%, -50%) scale(0.08)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(0.42)", offset: 0.18 },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.46 },
    { opacity: 0, transform: "translate(-50%, -50%) scale(1.24)" },
  ], {
    duration: 220,
    easing: "cubic-bezier(0.16, 0.84, 0.22, 1)",
  });
}

function playImpactFlash(impact, duration) {
  const flashElement = document.createElement("span");
  flashElement.style.position = "absolute";
  flashElement.style.inset = "0";
  flashElement.style.zIndex = "9";
  flashElement.style.opacity = "0";
  flashElement.style.background = [
    "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.58) 24%, rgba(255, 239, 197, 0.16) 52%, rgba(255, 239, 197, 0) 76%)",
    "linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 247, 222, 0.72))",
  ].join(",");
  overlayElement.appendChild(flashElement);

  const animation = flashElement.animate([
    { opacity: 0 },
    { opacity: 1, offset: 0.22 },
    { opacity: 0.36, offset: 0.6 },
    { opacity: 0 },
  ], {
    duration,
    easing: "cubic-bezier(0.18, 0.92, 0.22, 1)",
    fill: "both",
  });

  return animation.finished.then(() => {
    animation.cancel();
    flashElement.remove();
  }).catch(() => {
    flashElement.remove();
  });
}

function playImpactShockwave(impact, lightballSettings) {
  shakeBoardFrame(lightballSettings.shockwaveShakeStrength);
  const stageWidth = stageElement?.clientWidth || 0;
  const stageHeight = stageElement?.clientHeight || 0;
  const maxRadius = Math.max(
    Math.hypot(impact.center.x, impact.center.y),
    Math.hypot(stageWidth - impact.center.x, impact.center.y),
    Math.hypot(impact.center.x, stageHeight - impact.center.y),
    Math.hypot(stageWidth - impact.center.x, stageHeight - impact.center.y),
  );
  const size = Math.max(impact.baseSize * 2.4, maxRadius * 2);
  return playOverlayCircle("lightball-impact-shockwave", impact.center, size, [
    { opacity: 0, transform: "translate(-50%, -50%) scale(0.04)" },
    { opacity: 0.98, transform: "translate(-50%, -50%) scale(0.16)", offset: 0.12 },
    { opacity: 1, transform: "translate(-50%, -50%) scale(0.42)", offset: 0.36 },
    { opacity: 0.94, transform: "translate(-50%, -50%) scale(0.82)", offset: 0.74 },
    { opacity: 0.76, transform: "translate(-50%, -50%) scale(0.94)", offset: 0.9 },
    { opacity: 0, transform: "translate(-50%, -50%) scale(1)" },
  ], {
    duration: lightballSettings.shockwaveDuration,
    easing: "linear",
  });
}

function playOverlayCircle(className, center, size, keyframes, options) {
  const element = document.createElement("span");
  element.className = className;
  element.style.left = `${center.x}px`;
  element.style.top = `${center.y}px`;
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  overlayElement.appendChild(element);

  const animation = element.animate(keyframes, {
    fill: "both",
    ...options,
  });

  return animation.finished.then(() => {
    animation.cancel();
    element.remove();
  }).catch(() => {
    element.remove();
  });
}

function shakeBoardFrame(strength = 1) {
  if (!boardFrameElement?.animate || strength <= 0) {
    return;
  }

  const amplitude = Math.min(24, Math.max(6, strength * 8));
  boardFrameElement.animate([
    { transform: "translate(-50%, -50%) translate3d(0, 0, 0) scale(1)" },
    { transform: `translate(-50%, -50%) translate3d(${-amplitude}px, 0, 0) scale(1.01)`, offset: 0.16 },
    { transform: `translate(-50%, -50%) translate3d(${amplitude * 0.92}px, 0, 0) scale(0.995)`, offset: 0.32 },
    { transform: `translate(-50%, -50%) translate3d(${-(amplitude * 0.68)}px, 0, 0) scale(1.008)`, offset: 0.52 },
    { transform: `translate(-50%, -50%) translate3d(${amplitude * 0.38}px, 0, 0) scale(0.998)`, offset: 0.74 },
    { transform: "translate(-50%, -50%) translate3d(0, 0, 0) scale(1)" },
  ], {
    duration: Math.round(180 + strength * 40),
    easing: "cubic-bezier(0.2, 0.84, 0.22, 1)",
  });
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
  return document.createElementNS(SVG_NS, tagName);
}

function wait(duration) {
  return new Promise((resolve) => {
    setTrackedTimeout(resolve, duration);
  });
}

function bindControl(inputId, outputId, { read, write, serialize = (value) => value }) {
  const inputElement = document.querySelector(`#${inputId}`);
  const outputElement = document.querySelector(`#${outputId}`);

  return {
    inputElement,
    outputElement,
    read,
    write,
    serialize,
  };
}

function numberControl(suffix = "") {
  return {
    read: (value) => Number(value),
    write: (value) => `${Math.round(value)}${suffix}`,
  };
}

function integerControl() {
  return {
    read: (value) => Number(value),
    write: (value) => String(Math.round(value)),
  };
}

function ratioControl() {
  return {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}%`,
    serialize: (value) => Math.round(value * 100),
  };
}

function scaleControl(suffix = "%") {
  return {
    read: (value) => Number(value) / 100,
    write: (value) => `${Math.round(value * 100)}${suffix}`,
    serialize: (value) => Math.round(value * 100),
  };
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

function easeInCubic(progress) {
  return progress * progress * progress;
}

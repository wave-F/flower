export const DUAL_LIGHTBALL_TIMINGS = {
  "orbitDuration": 1500,
  "orbitSpeed": 2.54,
  "orbitEndScale": 0.98,
  "stopDuration": 90,
  "collisionDuration": 140,
  "collisionPeakScale": 1.24,
  "collisionEndScale": 0.22,
  "collisionFadeStart": 0.8,
  "stopRadiusScale": 0.88,
  "orbitStretchScale": 0.12,
  "focusOpacity": 0.86,
  "focusFadeInDuration": 180,
  "focusFadeOutDuration": 170,
  "flareDuration": 220,
  "flashDuration": 340,
  "shockwaveDuration": 1200,
  "shockwaveSizeMultiplier": 9.4,
  "shockwaveShakeStrength": 1.6,
  "popDuration": 180,
  "waveStagger": 14
};

export function normalizeDualLightballTimings(timings) {
  const orbitDuration = normalizeDuration(timings.orbitDuration, DUAL_LIGHTBALL_TIMINGS.orbitDuration);
  const derivedOrbitSpeed = Number.isFinite(Number(timings.orbitSpeed))
    ? Number(timings.orbitSpeed)
    : Number.isFinite(Number(timings.turns))
      ? Number(timings.turns) / Math.max(0.1, orbitDuration / 1000)
      : DUAL_LIGHTBALL_TIMINGS.orbitSpeed;

  return {
    orbitDuration,
    orbitSpeed: normalizeScale(derivedOrbitSpeed, DUAL_LIGHTBALL_TIMINGS.orbitSpeed, 0.1, 12),
    orbitEndScale: normalizeScale(timings.orbitEndScale, DUAL_LIGHTBALL_TIMINGS.orbitEndScale, 0.2, 3),
    stopDuration: normalizeDelay(timings.stopDuration, DUAL_LIGHTBALL_TIMINGS.stopDuration),
    collisionDuration: normalizeDuration(timings.collisionDuration, DUAL_LIGHTBALL_TIMINGS.collisionDuration),
    collisionPeakScale: normalizeScale(timings.collisionPeakScale, DUAL_LIGHTBALL_TIMINGS.collisionPeakScale, 0.2, 3),
    collisionEndScale: normalizeScale(timings.collisionEndScale, DUAL_LIGHTBALL_TIMINGS.collisionEndScale, 0.05, 2),
    collisionFadeStart: normalizeScale(timings.collisionFadeStart, DUAL_LIGHTBALL_TIMINGS.collisionFadeStart, 0.1, 0.98),
    stopRadiusScale: normalizeScale(timings.stopRadiusScale, DUAL_LIGHTBALL_TIMINGS.stopRadiusScale, 0.2, 1),
    orbitStretchScale: normalizeScale(timings.orbitStretchScale, DUAL_LIGHTBALL_TIMINGS.orbitStretchScale, 0, 1),
    focusOpacity: normalizeScale(timings.focusOpacity, DUAL_LIGHTBALL_TIMINGS.focusOpacity, 0, 1),
    focusFadeInDuration: normalizeDuration(timings.focusFadeInDuration, DUAL_LIGHTBALL_TIMINGS.focusFadeInDuration),
    focusFadeOutDuration: normalizeDuration(timings.focusFadeOutDuration, DUAL_LIGHTBALL_TIMINGS.focusFadeOutDuration),
    flareDuration: normalizeDuration(timings.flareDuration, DUAL_LIGHTBALL_TIMINGS.flareDuration),
    flashDuration: normalizeDuration(timings.flashDuration, DUAL_LIGHTBALL_TIMINGS.flashDuration),
    shockwaveDuration: normalizeDuration(timings.shockwaveDuration, DUAL_LIGHTBALL_TIMINGS.shockwaveDuration),
    shockwaveSizeMultiplier: normalizeScale(timings.shockwaveSizeMultiplier, DUAL_LIGHTBALL_TIMINGS.shockwaveSizeMultiplier, 1, 20),
    shockwaveShakeStrength: normalizeScale(timings.shockwaveShakeStrength, DUAL_LIGHTBALL_TIMINGS.shockwaveShakeStrength, 0, 5),
    popDuration: normalizeDuration(timings.popDuration, DUAL_LIGHTBALL_TIMINGS.popDuration),
    waveStagger: normalizeDelay(timings.waveStagger, DUAL_LIGHTBALL_TIMINGS.waveStagger),
  };
}

export function applyDualLightballTimings(timings) {
  const normalized = normalizeDualLightballTimings(timings);
  Object.assign(DUAL_LIGHTBALL_TIMINGS, normalized);
  return normalized;
}

function normalizeDuration(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(40, Math.min(5000, Math.round(parsed)));
}

function normalizeDelay(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(5000, Math.round(parsed)));
}

function normalizeScale(value, fallback, min = 0.2, max = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(parsed * 100) / 100));
}

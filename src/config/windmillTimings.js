export const WINDMILL_TIMINGS = {
  "spinUpDuration": 200,
  "burstDuration": 520,
  "windLineDuration": 520,
  "windLineStagger": 0,
  "flowerFlyDuration": 1000,
  "targetHitPulseDuration": 280,
  "windWidthScale": 1.8,
  "windCurlScale": 1.8,
  "windSpreadScale": 0.4,
  "windDustCount": 4,
  "windDustSizeScale": 1,
  "windDustWobbleScale": 1,
  "fadeDuration": 80
};

export function normalizeWindmillTimings(timings) {
  const windLineDuration = normalizeDuration(timings.windLineDuration ?? timings.burstDuration, WINDMILL_TIMINGS.windLineDuration);
  return {
    spinUpDuration: normalizeDuration(timings.spinUpDuration, WINDMILL_TIMINGS.spinUpDuration),
    burstDuration: windLineDuration,
    windLineDuration,
    windLineStagger: normalizeDelay(timings.windLineStagger, WINDMILL_TIMINGS.windLineStagger),
    flowerFlyDuration: normalizeDuration(timings.flowerFlyDuration, WINDMILL_TIMINGS.flowerFlyDuration),
    targetHitPulseDuration: normalizeDuration(timings.targetHitPulseDuration, WINDMILL_TIMINGS.targetHitPulseDuration),
    windWidthScale: normalizeScale(timings.windWidthScale, WINDMILL_TIMINGS.windWidthScale),
    windCurlScale: normalizeScale(timings.windCurlScale, WINDMILL_TIMINGS.windCurlScale),
    windSpreadScale: normalizeScale(timings.windSpreadScale, WINDMILL_TIMINGS.windSpreadScale),
    windDustCount: normalizeCount(timings.windDustCount, WINDMILL_TIMINGS.windDustCount),
    windDustSizeScale: normalizeScale(timings.windDustSizeScale, WINDMILL_TIMINGS.windDustSizeScale),
    windDustWobbleScale: normalizeScale(timings.windDustWobbleScale, WINDMILL_TIMINGS.windDustWobbleScale),
    fadeDuration: normalizeDuration(timings.fadeDuration, WINDMILL_TIMINGS.fadeDuration),
  };
}

export function applyWindmillTimings(timings) {
  const normalized = normalizeWindmillTimings(timings);
  WINDMILL_TIMINGS.spinUpDuration = normalized.spinUpDuration;
  WINDMILL_TIMINGS.burstDuration = normalized.burstDuration;
  WINDMILL_TIMINGS.windLineDuration = normalized.windLineDuration;
  WINDMILL_TIMINGS.windLineStagger = normalized.windLineStagger;
  WINDMILL_TIMINGS.flowerFlyDuration = normalized.flowerFlyDuration;
  WINDMILL_TIMINGS.targetHitPulseDuration = normalized.targetHitPulseDuration;
  WINDMILL_TIMINGS.windWidthScale = normalized.windWidthScale;
  WINDMILL_TIMINGS.windCurlScale = normalized.windCurlScale;
  WINDMILL_TIMINGS.windSpreadScale = normalized.windSpreadScale;
  WINDMILL_TIMINGS.windDustCount = normalized.windDustCount;
  WINDMILL_TIMINGS.windDustSizeScale = normalized.windDustSizeScale;
  WINDMILL_TIMINGS.windDustWobbleScale = normalized.windDustWobbleScale;
  WINDMILL_TIMINGS.fadeDuration = normalized.fadeDuration;
  return normalized;
}

function normalizeDuration(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(80, Math.min(5000, Math.round(parsed)));
}

function normalizeDelay(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(5000, Math.round(parsed)));
}

function normalizeScale(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0.2, Math.min(3, Math.round(parsed * 100) / 100));
}

function normalizeCount(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(24, Math.round(parsed)));
}

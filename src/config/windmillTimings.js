export const WINDMILL_TIMINGS = {
  spinUpDuration: 200,
  burstDuration: 300,
  flowerFlyDuration: 1000,
  fadeDuration: 80,
};

export function normalizeWindmillTimings(timings) {
  return {
    spinUpDuration: normalizeDuration(timings.spinUpDuration, WINDMILL_TIMINGS.spinUpDuration),
    burstDuration: normalizeDuration(timings.burstDuration, WINDMILL_TIMINGS.burstDuration),
    flowerFlyDuration: normalizeDuration(timings.flowerFlyDuration, WINDMILL_TIMINGS.flowerFlyDuration),
    fadeDuration: normalizeDuration(timings.fadeDuration, WINDMILL_TIMINGS.fadeDuration),
  };
}

export function applyWindmillTimings(timings) {
  const normalized = normalizeWindmillTimings(timings);
  WINDMILL_TIMINGS.spinUpDuration = normalized.spinUpDuration;
  WINDMILL_TIMINGS.burstDuration = normalized.burstDuration;
  WINDMILL_TIMINGS.flowerFlyDuration = normalized.flowerFlyDuration;
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

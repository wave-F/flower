import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const WINDMILL_TIMINGS_PATH = path.join(ROOT_DIR, "src/config/windmillTimings.js");
const LIGHTBALL_TIMINGS_PATH = path.join(ROOT_DIR, "src/config/lightballTimings.js");
const HOST = "127.0.0.1";
const PORT = 3210;

const server = http.createServer(async (request, response) => {
  addCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && request.url === "/api/write-effect-defaults") {
    try {
      const body = await readJsonBody(request);
      const effectKey = body?.effectKey === "lightball" ? "lightball" : "windmill";
      const normalized = effectKey === "lightball"
        ? normalizeLightballPayload(body?.settings ?? {})
        : normalizeWindmillPayload(body?.settings ?? {});
      const filePath = effectKey === "lightball" ? LIGHTBALL_TIMINGS_PATH : WINDMILL_TIMINGS_PATH;
      const source = effectKey === "lightball"
        ? buildLightballTimingsSource(normalized)
        : buildWindmillTimingsSource(normalized);
      await fs.writeFile(filePath, source, "utf8");
      sendJson(response, 200, {
        ok: true,
        message: `${effectKey} timings written.`,
        effectKey,
        filePath,
        timings: normalized,
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        message: error?.message ?? String(error),
      });
    }
    return;
  }

  if (request.method === "GET") {
    try {
      await serveStaticFile(request.url, response);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error?.code === "ENOENT" ? "Not found" : "Server error");
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Method Not Allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Windmill writeback server running at http://${HOST}:${PORT}`);
});

function addCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function normalizeWindmillPayload(payload) {
  return {
    spinUpDuration: 200,
    burstDuration: normalizeDuration(payload.gustDuration, 520),
    windLineDuration: normalizeDuration(payload.gustDuration, 520),
    windLineStagger: 0,
    flowerFlyDuration: 1000,
    targetHitPulseDuration: normalizeDuration(payload.hitDuration, 280),
    windWidthScale: normalizeScale(payload.widthScale, 1),
    windCurlScale: normalizeScale(payload.curlScale, 1),
    windSpreadScale: normalizeScale(payload.spreadScale, 1),
    windDustCount: normalizeCount(payload.dustCount, 4),
    windDustSizeScale: normalizeScale(payload.dustSizeScale, 1),
    windDustWobbleScale: normalizeScale(payload.dustWobbleScale, 1),
    fadeDuration: 80,
  };
}

function normalizeLightballPayload(payload) {
  const orbitDuration = normalizeDuration(payload.orbitDuration, 670);
  const derivedOrbitSpeed = Number.isFinite(Number(payload.orbitSpeed))
    ? Number(payload.orbitSpeed)
    : Number.isFinite(Number(payload.turns))
      ? Number(payload.turns) / Math.max(0.1, orbitDuration / 1000)
      : 2.54;

  return {
    orbitDuration,
    orbitSpeed: normalizeScale(derivedOrbitSpeed, 2.54, 0.1, 12),
    orbitEndScale: 0.98,
    stopDuration: normalizeDelay(payload.stopDuration, 90),
    collisionDuration: normalizeDuration(payload.collisionDuration, 140),
    collisionPeakScale: normalizeScale(payload.collisionPeakScale, 1.24, 0.2, 3),
    collisionEndScale: normalizeScale(payload.collisionEndScale, 0.22, 0.05, 2),
    collisionFadeStart: 0.8,
    stopRadiusScale: normalizeScale(payload.stopRadiusScale, 0.88, 0.2, 1),
    orbitStretchScale: normalizeScale(payload.orbitStretchScale, 0.12, 0, 1),
    focusOpacity: normalizeScale(payload.focusOpacity, 0.86, 0, 1),
    focusFadeInDuration: normalizeDuration(payload.focusFadeInDuration, 180),
    focusFadeOutDuration: normalizeDuration(payload.focusFadeOutDuration, 170),
    flareDuration: 220,
    flashDuration: normalizeDuration(payload.flashDuration, 340),
    shockwaveDuration: normalizeDuration(payload.shockwaveDuration, 1200),
    shockwaveSizeMultiplier: normalizeScale(payload.shockwaveSizeMultiplier, 9.4, 1, 20),
    shockwaveShakeStrength: normalizeScale(payload.shockwaveShakeStrength, 1.6, 0, 5),
    popDuration: 180,
    waveStagger: 14,
  };
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

function normalizeScale(value, fallback, min = 0.2, max = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed * 100) / 100));
}

function normalizeCount(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(24, Math.round(parsed)));
}

function buildWindmillTimingsSource(config) {
  return `export const WINDMILL_TIMINGS = ${JSON.stringify(config, null, 2)};\n\nexport function normalizeWindmillTimings(timings) {\n  const windLineDuration = normalizeDuration(timings.windLineDuration ?? timings.burstDuration, WINDMILL_TIMINGS.windLineDuration);\n  return {\n    spinUpDuration: normalizeDuration(timings.spinUpDuration, WINDMILL_TIMINGS.spinUpDuration),\n    burstDuration: windLineDuration,\n    windLineDuration,\n    windLineStagger: normalizeDelay(timings.windLineStagger, WINDMILL_TIMINGS.windLineStagger),\n    flowerFlyDuration: normalizeDuration(timings.flowerFlyDuration, WINDMILL_TIMINGS.flowerFlyDuration),\n    targetHitPulseDuration: normalizeDuration(timings.targetHitPulseDuration, WINDMILL_TIMINGS.targetHitPulseDuration),\n    windWidthScale: normalizeScale(timings.windWidthScale, WINDMILL_TIMINGS.windWidthScale),\n    windCurlScale: normalizeScale(timings.windCurlScale, WINDMILL_TIMINGS.windCurlScale),\n    windSpreadScale: normalizeScale(timings.windSpreadScale, WINDMILL_TIMINGS.windSpreadScale),\n    windDustCount: normalizeCount(timings.windDustCount, WINDMILL_TIMINGS.windDustCount),\n    windDustSizeScale: normalizeScale(timings.windDustSizeScale, WINDMILL_TIMINGS.windDustSizeScale),\n    windDustWobbleScale: normalizeScale(timings.windDustWobbleScale, WINDMILL_TIMINGS.windDustWobbleScale),\n    fadeDuration: normalizeDuration(timings.fadeDuration, WINDMILL_TIMINGS.fadeDuration),\n  };\n}\n\nexport function applyWindmillTimings(timings) {\n  const normalized = normalizeWindmillTimings(timings);\n  WINDMILL_TIMINGS.spinUpDuration = normalized.spinUpDuration;\n  WINDMILL_TIMINGS.burstDuration = normalized.burstDuration;\n  WINDMILL_TIMINGS.windLineDuration = normalized.windLineDuration;\n  WINDMILL_TIMINGS.windLineStagger = normalized.windLineStagger;\n  WINDMILL_TIMINGS.flowerFlyDuration = normalized.flowerFlyDuration;\n  WINDMILL_TIMINGS.targetHitPulseDuration = normalized.targetHitPulseDuration;\n  WINDMILL_TIMINGS.windWidthScale = normalized.windWidthScale;\n  WINDMILL_TIMINGS.windCurlScale = normalized.windCurlScale;\n  WINDMILL_TIMINGS.windSpreadScale = normalized.windSpreadScale;\n  WINDMILL_TIMINGS.windDustCount = normalized.windDustCount;\n  WINDMILL_TIMINGS.windDustSizeScale = normalized.windDustSizeScale;\n  WINDMILL_TIMINGS.windDustWobbleScale = normalized.windDustWobbleScale;\n  WINDMILL_TIMINGS.fadeDuration = normalized.fadeDuration;\n  return normalized;\n}\n\nfunction normalizeDuration(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(80, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeDelay(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeScale(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0.2, Math.min(3, Math.round(parsed * 100) / 100));\n}\n\nfunction normalizeCount(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(24, Math.round(parsed)));\n}\n`;
}

function buildLightballTimingsSource(config) {
  return `export const DUAL_LIGHTBALL_TIMINGS = ${JSON.stringify(config, null, 2)};\n\nexport function normalizeDualLightballTimings(timings) {\n  const orbitDuration = normalizeDuration(timings.orbitDuration, DUAL_LIGHTBALL_TIMINGS.orbitDuration);\n  const derivedOrbitSpeed = Number.isFinite(Number(timings.orbitSpeed))\n    ? Number(timings.orbitSpeed)\n    : Number.isFinite(Number(timings.turns))\n      ? Number(timings.turns) / Math.max(0.1, orbitDuration / 1000)\n      : DUAL_LIGHTBALL_TIMINGS.orbitSpeed;\n\n  return {\n    orbitDuration,\n    orbitSpeed: normalizeScale(derivedOrbitSpeed, DUAL_LIGHTBALL_TIMINGS.orbitSpeed, 0.1, 12),\n    orbitEndScale: normalizeScale(timings.orbitEndScale, DUAL_LIGHTBALL_TIMINGS.orbitEndScale, 0.2, 3),\n    stopDuration: normalizeDelay(timings.stopDuration, DUAL_LIGHTBALL_TIMINGS.stopDuration),\n    collisionDuration: normalizeDuration(timings.collisionDuration, DUAL_LIGHTBALL_TIMINGS.collisionDuration),\n    collisionPeakScale: normalizeScale(timings.collisionPeakScale, DUAL_LIGHTBALL_TIMINGS.collisionPeakScale, 0.2, 3),\n    collisionEndScale: normalizeScale(timings.collisionEndScale, DUAL_LIGHTBALL_TIMINGS.collisionEndScale, 0.05, 2),\n    collisionFadeStart: normalizeScale(timings.collisionFadeStart, DUAL_LIGHTBALL_TIMINGS.collisionFadeStart, 0.1, 0.98),\n    stopRadiusScale: normalizeScale(timings.stopRadiusScale, DUAL_LIGHTBALL_TIMINGS.stopRadiusScale, 0.2, 1),\n    orbitStretchScale: normalizeScale(timings.orbitStretchScale, DUAL_LIGHTBALL_TIMINGS.orbitStretchScale, 0, 1),\n    focusOpacity: normalizeScale(timings.focusOpacity, DUAL_LIGHTBALL_TIMINGS.focusOpacity, 0, 1),\n    focusFadeInDuration: normalizeDuration(timings.focusFadeInDuration, DUAL_LIGHTBALL_TIMINGS.focusFadeInDuration),\n    focusFadeOutDuration: normalizeDuration(timings.focusFadeOutDuration, DUAL_LIGHTBALL_TIMINGS.focusFadeOutDuration),\n    flareDuration: normalizeDuration(timings.flareDuration, DUAL_LIGHTBALL_TIMINGS.flareDuration),\n    flashDuration: normalizeDuration(timings.flashDuration, DUAL_LIGHTBALL_TIMINGS.flashDuration),\n    shockwaveDuration: normalizeDuration(timings.shockwaveDuration, DUAL_LIGHTBALL_TIMINGS.shockwaveDuration),\n    shockwaveSizeMultiplier: normalizeScale(timings.shockwaveSizeMultiplier, DUAL_LIGHTBALL_TIMINGS.shockwaveSizeMultiplier, 1, 20),\n    shockwaveShakeStrength: normalizeScale(timings.shockwaveShakeStrength, DUAL_LIGHTBALL_TIMINGS.shockwaveShakeStrength, 0, 5),\n    popDuration: normalizeDuration(timings.popDuration, DUAL_LIGHTBALL_TIMINGS.popDuration),\n    waveStagger: normalizeDelay(timings.waveStagger, DUAL_LIGHTBALL_TIMINGS.waveStagger),\n  };\n}\n\nexport function applyDualLightballTimings(timings) {\n  const normalized = normalizeDualLightballTimings(timings);\n  Object.assign(DUAL_LIGHTBALL_TIMINGS, normalized);\n  return normalized;\n}\n\nfunction normalizeDuration(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(40, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeDelay(value, fallback) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(0, Math.min(5000, Math.round(parsed)));\n}\n\nfunction normalizeScale(value, fallback, min = 0.2, max = 3) {\n  const parsed = Number(value);\n  if (!Number.isFinite(parsed)) {\n    return fallback;\n  }\n\n  return Math.max(min, Math.min(max, Math.round(parsed * 100) / 100));\n}\n`;
}

async function serveStaticFile(requestUrl, response) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") {
    pathname = "/windmill-showcase.html";
  }

  const resolved = path.resolve(ROOT_DIR, `.${pathname}`);
  if (!resolved.startsWith(ROOT_DIR)) {
    throw new Error("Path traversal denied.");
  }

  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    throw Object.assign(new Error("Not found"), { code: "ENOENT" });
  }

  const content = await fs.readFile(resolved);
  response.writeHead(200, { "Content-Type": getContentType(resolved) });
  response.end(content);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".png": return "image/png";
    case ".svg": return "image/svg+xml";
    case ".json": return "application/json; charset=utf-8";
    default: return "application/octet-stream";
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

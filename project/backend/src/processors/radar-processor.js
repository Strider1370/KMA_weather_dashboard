const fs = require("fs");
const path = require("path");
const config = require("../config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureRadarDir() {
  const radarDir = path.join(config.storage.base_path, "radar");
  fs.mkdirSync(radarDir, { recursive: true });
  return radarDir;
}

function formatKstTm(dateKst) {
  const y = dateKst.getUTCFullYear();
  const m = String(dateKst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateKst.getUTCDate()).padStart(2, "0");
  const h = String(dateKst.getUTCHours()).padStart(2, "0");
  const mi = String(dateKst.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${mi}`;
}

function getCandidateTms(delayMinutes = config.radar.delay_minutes) {
  const nowUtc = new Date();
  const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  nowKst.setUTCMinutes(nowKst.getUTCMinutes() - delayMinutes);

  const minute = Math.floor(nowKst.getUTCMinutes() / 5) * 5;
  nowKst.setUTCMinutes(minute, 0, 0);

  return [0, 1, 2].map((i) => {
    const t = new Date(nowKst.getTime() - i * 5 * 60 * 1000);
    return formatKstTm(t);
  });
}

function parseKstTm(tm) {
  if (!/^\d{12}$/.test(tm)) return null;
  const y = Number(tm.slice(0, 4));
  const m = Number(tm.slice(4, 6));
  const d = Number(tm.slice(6, 8));
  const hh = Number(tm.slice(8, 10));
  const mi = Number(tm.slice(10, 12));
  const utcMs = Date.UTC(y, m - 1, d, hh - 9, mi, 0, 0);
  return new Date(utcMs);
}

function isValidPng(buffer) {
  return (
    buffer &&
    buffer.length > 1000 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

async function fetchWithTimeout(url, ms = config.radar.timeout_ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildRadarUrl(tm) {
  const params = new URLSearchParams({
    tm,
    data: "img",
    cmp: config.radar.cmp,
    authKey: config.api.radar_auth_key
  });
  return `${config.api.radar_url}?${params.toString()}`;
}

async function fetchRadarImage(tm) {
  const url = buildRadarUrl(tm);
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("image") && !contentType.includes("zip") && !contentType.includes("octet-stream")) {
      return null;
    }
    return isValidPng(buffer) ? buffer : null;
  } catch (error) {
    return null;
  }
}

function cleanupOldImages(radarDir, maxCount = config.radar.max_images) {
  const files = fs.readdirSync(radarDir)
    .filter((f) => /^RDR_\d{12}\.png$/.test(f))
    .sort();

  while (files.length > maxCount) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(radarDir, oldest));
  }
}

function updateLatestJson(radarDir) {
  const imageFiles = fs.readdirSync(radarDir)
    .filter((f) => /^RDR_\d{12}\.png$/.test(f))
    .sort();

  const images = imageFiles.map((filename) => {
    const tm = filename.slice(4, 16);
    const tmUtc = parseKstTm(tm);
    return {
      tm,
      tm_utc: tmUtc ? tmUtc.toISOString() : null,
      filename,
      path: `/data/radar/${filename}`
    };
  });

  const payload = {
    type: "RADAR",
    updated_at: new Date().toISOString(),
    image_count: images.length,
    interval_minutes: config.radar.interval_minutes,
    images
  };

  fs.writeFileSync(path.join(radarDir, "latest.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

async function downloadLatestAvailable(radarDir) {
  const candidates = getCandidateTms();
  let lastTriedTm = null;

  for (const tm of candidates) {
    lastTriedTm = tm;
    const filename = `RDR_${tm}.png`;
    const filePath = path.join(radarDir, filename);
    if (fs.existsSync(filePath)) {
      return { downloaded: false, tm, reason: "exists" };
    }

    const buffer = await fetchRadarImage(tm);
    if (buffer) {
      fs.writeFileSync(filePath, buffer);
      return { downloaded: true, tm, filename };
    }
  }

  return { downloaded: false, tm: lastTriedTm, reason: "not_found" };
}

async function backfillIfEmpty(radarDir) {
  const existing = fs.readdirSync(radarDir).filter((f) => /^RDR_\d{12}\.png$/.test(f));
  if (existing.length > 0) return 0;

  const endTm = getCandidateTms()[0];
  const end = parseKstTm(endTm);
  if (!end) return 0;

  let added = 0;
  for (let i = config.radar.max_images - 1; i >= 0; i -= 1) {
    const tUtc = new Date(end.getTime() - i * 5 * 60 * 1000);
    const tKst = new Date(tUtc.getTime() + 9 * 60 * 60 * 1000);
    const tm = formatKstTm(tKst);
    const filename = `RDR_${tm}.png`;
    const filePath = path.join(radarDir, filename);
    if (fs.existsSync(filePath)) continue;
    const buffer = await fetchRadarImage(tm);
    if (buffer) {
      fs.writeFileSync(filePath, buffer);
      added += 1;
    }
    await sleep(300);
  }
  return added;
}

async function process() {
  if (!config.api.radar_auth_key) {
    throw new Error("Radar auth key missing (set KMA_AUTH_KEY or API_AUTH_KEY)");
  }

  const radarDir = ensureRadarDir();
  const backfilled = await backfillIfEmpty(radarDir);
  const downloadResult = await downloadLatestAvailable(radarDir);

  cleanupOldImages(radarDir);
  const latest = updateLatestJson(radarDir);

  return {
    type: "radar",
    saved: downloadResult.downloaded || backfilled > 0,
    imageCount: latest.image_count,
    latestTm: downloadResult.tm || latest.images[latest.images.length - 1]?.tm || null,
    downloaded: downloadResult.downloaded,
    backfilled
  };
}

module.exports = { process };

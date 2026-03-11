const fs = require("fs");
const path = require("path");
const config = require("../config");
const { parseRadarBinary, cropAirportEcho, renderNationwideEcho } = require("../parsers/radar-echo-parser");

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

function getLatestTm(delayMinutes = config.radar_echo.delay_minutes) {
  const nowUtc = new Date();
  const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  nowKst.setUTCMinutes(nowKst.getUTCMinutes() - delayMinutes);

  const minute = Math.floor(nowKst.getUTCMinutes() / 5) * 5;
  nowKst.setUTCMinutes(minute, 0, 0);

  return formatKstTm(nowKst);
}

function getCandidateTms(delayMinutes = config.radar_echo.delay_minutes) {
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

function buildEchoUrl(tm) {
  const params = new URLSearchParams({
    tm,
    data: "bin",
    cmp: "cpp",
    authKey: config.api.auth_key,
  });
  return `${config.api.radar_url}?${params.toString()}`;
}

async function fetchWithTimeout(url, ms = config.radar_echo.timeout_ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download radar binary (.bin.gz) for a given timestamp.
 * Returns raw gzipped Buffer or null on failure.
 */
async function fetchRadarBinary(tm) {
  const url = buildEchoUrl(tm);
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    // Sanity check: gzip starts with 0x1f 0x8b, minimum reasonable size
    if (buffer.length < 10000 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
      return null;
    }
    return buffer;
  } catch (error) {
    return null;
  }
}

async function process() {
  if (!config.api.auth_key) {
    throw new Error("Radar echo auth key missing (set API_AUTH_KEY)");
  }

  const radarDir = ensureRadarDir();
  const rangeKm = config.radar_echo.range_km;
  const cropSize = config.radar_echo.crop_size;
  const candidates = getCandidateTms();

  // Try candidates from newest to oldest
  let gzBuffer = null;
  let usedTm = null;

  for (const tm of candidates) {
    gzBuffer = await fetchRadarBinary(tm);
    if (gzBuffer) {
      usedTm = tm;
      break;
    }
  }

  if (!gzBuffer) {
    console.warn("radar_echo: no binary available for any candidate timestamp");
    return {
      type: "radar_echo",
      saved: false,
      reason: "no data available",
    };
  }

  // Parse full grid
  const { refl } = parseRadarBinary(gzBuffer);

  // Crop per airport and save transparent PNGs
  const airports = config.airports;
  const meta = {
    type: "RADAR_ECHO",
    updated_at: new Date().toISOString(),
    tm: usedTm,
    range_km: rangeKm,
    nationwide: null,
    airports: {},
  };

  let savedCount = 0;

  try {
    const nationwide = await renderNationwideEcho(refl);
    const nationwideFilename = "echo_korea.png";
    fs.writeFileSync(path.join(radarDir, nationwideFilename), nationwide.pngBuffer);
    meta.nationwide = {
      path: `/data/radar/${nationwideFilename}`,
      bounds: nationwide.bounds,
      width: nationwide.width,
      height: nationwide.height,
      echoCount: nationwide.echoCount,
      scale: nationwide.scale,
    };
  } catch (err) {
    console.warn("radar_echo: failed to render nationwide overlay:", err.message);
  }

  for (const airport of airports) {
    try {
      const result = await cropAirportEcho(
        refl,
        airport.lat,
        airport.lon,
        rangeKm,
        cropSize
      );

      const filename = `echo_${airport.icao}.png`;
      const filePath = path.join(radarDir, filename);
      fs.writeFileSync(filePath, result.pngBuffer);

      meta.airports[airport.icao] = {
        path: `/data/radar/${filename}`,
        bounds: result.bounds,
        width: result.width,
        height: result.height,
        echoCount: result.echoCount,
      };

      savedCount++;
    } catch (err) {
      console.warn(`radar_echo: failed to crop ${airport.icao}:`, err.message);
    }
  }

  // Write echo_meta.json
  const metaPath = path.join(radarDir, "echo_meta.json");
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  return {
    type: "radar_echo",
    saved: savedCount > 0,
    airportCount: savedCount,
    tm: usedTm,
  };
}

module.exports = { process };

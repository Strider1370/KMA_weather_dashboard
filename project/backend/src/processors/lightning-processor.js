const path = require("path");
const config = require("../config");
const store = require("../store");
const lightningParser = require("../parsers/lightning-parser");

function getCurrentKstTm() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

function buildLightningUrl(airport, tm) {
  const params = new URLSearchParams({
    tm,
    itv: String(config.lightning.itv_minutes),
    lon: String(airport.lon),
    lat: String(airport.lat),
    range: String(config.lightning.range_km),
    gc: "T",
    authKey: config.api.auth_key
  });
  return `${config.api.lightning_url}?${params.toString()}`;
}

async function fetchWithTimeout(url, timeoutMs = config.api.timeout_ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function summarize(strikes) {
  const byZone = { alert: 0, danger: 0, caution: 0 };
  const byType = { ground: 0, cloud: 0 };
  let maxIntensity = null;
  let latestTime = null;

  for (const strike of strikes) {
    if (byZone[strike.zone] != null) byZone[strike.zone] += 1;
    if (strike.type === "G") byType.ground += 1;
    if (strike.type === "C") byType.cloud += 1;
    if (maxIntensity == null || strike.intensity_abs > maxIntensity) {
      maxIntensity = strike.intensity_abs;
    }
    if (latestTime == null || new Date(strike.time).getTime() > new Date(latestTime).getTime()) {
      latestTime = strike.time;
    }
  }

  return {
    total_count: strikes.length,
    by_zone: byZone,
    by_type: byType,
    max_intensity: maxIntensity,
    latest_time: latestTime
  };
}

function emptyAirportPayload(airport) {
  return {
    airport_name: airport.name,
    arp: { lat: airport.lat, lon: airport.lon },
    summary: {
      total_count: 0,
      by_zone: { alert: 0, danger: 0, caution: 0 },
      by_type: { ground: 0, cloud: 0 },
      max_intensity: null,
      latest_time: null
    },
    strikes: []
  };
}

async function process() {
  const tm = getCurrentKstTm();
  const result = {
    type: "lightning",
    fetched_at: new Date().toISOString(),
    query: {
      tm,
      itv_minutes: config.lightning.itv_minutes,
      range_km: config.lightning.range_km
    },
    airports: {}
  };

  const previous = store.loadLatest(path.join(config.storage.base_path, "lightning"));
  const failedAirports = [];

  for (const airport of config.airports) {
    try {
      const raw = await fetchWithTimeout(buildLightningUrl(airport, tm));
      const strikes = lightningParser.parse(raw, airport, config.lightning.zones);
      result.airports[airport.icao] = {
        airport_name: airport.name,
        arp: { lat: airport.lat, lon: airport.lon },
        summary: summarize(strikes),
        strikes
      };
    } catch (error) {
      failedAirports.push(airport.icao);
      const prevAirport = previous?.airports?.[airport.icao];
      if (prevAirport) {
        result.airports[airport.icao] = {
          ...prevAirport,
          _stale: true
        };
      } else {
        result.airports[airport.icao] = emptyAirportPayload(airport);
      }
    }
  }

  const saveResult = store.save("lightning", result);
  const totalStrikes = Object.values(result.airports).reduce(
    (acc, airport) => acc + Number(airport?.summary?.total_count || 0),
    0
  );

  return {
    type: "lightning",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    airports: Object.keys(result.airports).length,
    totalStrikes,
    failedAirports
  };
}

module.exports = { process };

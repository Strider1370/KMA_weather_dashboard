const config = require("../config");
const apiClient = require("../api-client");
const store = require("../store");
const metarParser = require("../parsers/metar-parser");
const amosParser = require("../parsers/amos-parser");

function formatKstHourTm(isoOrDate) {
  const base = new Date(isoOrDate || Date.now());
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  const kst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCMinutes(0, 0, 0);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  return `${y}${m}${d}${hh}00`;
}

function buildAmosUrl(stn, tm) {
  const params = new URLSearchParams({
    tm,
    dtm: String(config.amos.dtm_minutes),
    stn: String(stn),
    help: "1",
    authKey: config.api.auth_key
  });
  return `${config.api.amos_url}?${params.toString()}`;
}

async function fetchAmosText(url, timeoutMs = config.amos.timeout_ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`AMOS HTTP ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function processAll() {
  const result = {
    type: "METAR",
    fetched_at: new Date().toISOString(),
    airports: {}
  };

  const failedAirports = [];
  const airportErrors = {};

  for (const airport of config.airports) {
    try {
      const xml = await apiClient.fetch("metar", airport.icao);
      const parsed = metarParser.parse(xml);
      if (parsed) {
        const targetHourTm = formatKstHourTm(parsed.header?.observation_time || parsed.header?.issue_time);
        const stn = airport.amos_stn;

        if (stn != null && targetHourTm) {
          try {
            const amosUrl = buildAmosUrl(stn, targetHourTm);
            const amosText = await fetchAmosText(amosUrl);
            const rows = amosParser.parseAmosRows(amosText);
            parsed.observation.rainfall_1h = amosParser.pickRainfallForHour(
              rows,
              targetHourTm,
              config.amos.stale_tolerance_minutes
            ) || {
              mm: null,
              rn_raw: null,
              observed_tm_kst: null,
              target_hour_kst: targetHourTm,
              stale: true
            };
          } catch (error) {
            parsed.observation.rainfall_1h = {
              mm: null,
              rn_raw: null,
              observed_tm_kst: null,
              target_hour_kst: targetHourTm,
              stale: true
            };
          }
        } else {
          parsed.observation.rainfall_1h = {
            mm: null,
            rn_raw: null,
            observed_tm_kst: null,
            target_hour_kst: targetHourTm,
            stale: false
          };
        }

        result.airports[airport.icao] = parsed;
      }
    } catch (error) {
      failedAirports.push(airport.icao);
      airportErrors[airport.icao] = error.message || "Unknown error";
    }
  }

  if (failedAirports.length > 0) {
    store.mergeWithPrevious(result, "metar", failedAirports);
  }

  const airportObsTimes = {};
  for (const [icao, data] of Object.entries(result.airports)) {
    if (data?.header) {
      airportObsTimes[icao] = {
        observation_time: data.header.observation_time || null,
        report_type: data.header.report_type || null
      };
    }
  }

  const saveResult = store.save("metar", result);
  return {
    type: "metar",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports,
    airportErrors,
    airportObsTimes
  };
}

module.exports = { processAll };

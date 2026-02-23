const config = require("../config");
const apiClient = require("../api-client");
const store = require("../store");
const stats = require("../stats");
const metarParser = require("../parsers/metar-parser");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// RKSI observes every 30 min; all others observe every hour.
function getExpectedMetarTime(icao, now) {
  const d = new Date(now);
  const windowMin = (icao === "RKSI" && d.getUTCMinutes() >= 30) ? 30 : 0;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), windowMin));
}

function isMetarStale(icao, data, now) {
  const obsTime = data?.header?.observation_time;
  if (!obsTime) return true;
  return new Date(obsTime) < getExpectedMetarTime(icao, now);
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
        result.airports[airport.icao] = parsed;
      }
    } catch (error) {
      failedAirports.push(airport.icao);
      airportErrors[airport.icao] = error.message || "Unknown error";
    }
  }

  // Batch retry for APPLICATION_ERROR airports (wait once, retry all failed together)
  const maxRetries = config.api.app_error_max_retries;
  const retryMs = config.api.app_error_retry_ms;

  for (let retry = 0; retry < maxRetries; retry++) {
    const appErrorIcaos = failedAirports.filter(icao =>
      /APPLICATION_ERROR/.test(airportErrors[icao])
    );
    if (appErrorIcaos.length === 0) break;

    await sleep(retryMs);

    for (const icao of appErrorIcaos) {
      try {
        const xml = await apiClient.fetch("metar", icao);
        const parsed = metarParser.parse(xml);
        if (parsed) {
          result.airports[icao] = parsed;
          failedAirports.splice(failedAirports.indexOf(icao), 1);
          delete airportErrors[icao];
        }
      } catch (error) {
        airportErrors[icao] = error.message || "Unknown error";
      }
    }
  }

  // Punctuality retry: re-fetch airports whose data is not from the current observation window.
  // Retries at 30s intervals up to punctuality_max_retries times, reporting live state to stats.
  const punctualityMaxRetries = config.api.punctuality_max_retries;
  const punctualityRetryMs = config.api.app_error_retry_ms;

  for (let retry = 0; retry < punctualityMaxRetries; retry++) {
    const now = new Date();
    const staleIcaos = config.airports
      .map(a => a.icao)
      .filter(icao => isMetarStale(icao, result.airports[icao], now));

    if (staleIcaos.length === 0) break;

    stats.setRetryState("metar", staleIcaos, retry + 1, punctualityMaxRetries);
    await sleep(punctualityRetryMs);

    for (const icao of staleIcaos) {
      try {
        const xml = await apiClient.fetch("metar", icao);
        const parsed = metarParser.parse(xml);
        if (parsed) {
          result.airports[icao] = parsed;
          const idx = failedAirports.indexOf(icao);
          if (idx !== -1) {
            failedAirports.splice(idx, 1);
            delete airportErrors[icao];
          }
        }
      } catch (error) {
        airportErrors[icao] = error.message || "Unknown error";
      }
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

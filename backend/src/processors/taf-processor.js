const config = require("../config");
const apiClient = require("../api-client");
const store = require("../store");
const tafParser = require("../parsers/taf-parser");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TAF is issued every 6 hours: 00Z, 06Z, 12Z, 18Z.
function getExpectedTafTime(now) {
  const d = new Date(now);
  const windowHour = Math.floor(d.getUTCHours() / 6) * 6;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), windowHour, 0));
}

function isTafStale(data, now) {
  const issued = data?.header?.issued;
  if (!issued) return true;
  return new Date(issued) < getExpectedTafTime(now);
}

async function processAll() {
  const result = {
    type: "TAF",
    fetched_at: new Date().toISOString(),
    airports: {}
  };

  const failedAirports = [];
  const airportErrors = {};

  for (const airport of config.airports) {
    try {
      const xml = await apiClient.fetch("taf", airport.icao);
      const parsed = tafParser.parse(xml);
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
        const xml = await apiClient.fetch("taf", icao);
        const parsed = tafParser.parse(xml);
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

  // Punctuality retry: re-fetch airports whose TAF is not from the current issuance window
  // (00Z / 06Z / 12Z / 18Z). Retries at 30s intervals up to punctuality_max_retries times.
  const punctualityMaxRetries = config.api.punctuality_max_retries;
  const punctualityRetryMs = config.api.app_error_retry_ms;

  for (let retry = 0; retry < punctualityMaxRetries; retry++) {
    const now = new Date();
    const staleIcaos = config.airports
      .map(a => a.icao)
      .filter(icao => isTafStale(result.airports[icao], now));

    if (staleIcaos.length === 0) break;

    await sleep(punctualityRetryMs);

    for (const icao of staleIcaos) {
      try {
        const xml = await apiClient.fetch("taf", icao);
        const parsed = tafParser.parse(xml);
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
    store.mergeWithPrevious(result, "taf", failedAirports);
  }

  const saveResult = store.save("taf", result);
  return {
    type: "taf",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports,
    airportErrors
  };
}

module.exports = { processAll };

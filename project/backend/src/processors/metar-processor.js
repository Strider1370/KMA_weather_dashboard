const config = require("../config");
const apiClient = require("../api-client");
const store = require("../store");
const metarParser = require("../parsers/metar-parser");

async function processAll() {
  const result = {
    type: "METAR",
    fetched_at: new Date().toISOString(),
    airports: {}
  };

  const failedAirports = [];

  for (const airport of config.airports) {
    try {
      const xml = await apiClient.fetch("metar", airport.icao);
      const parsed = metarParser.parse(xml);
      if (parsed) {
        result.airports[airport.icao] = parsed;
      }
    } catch (error) {
      failedAirports.push(airport.icao);
    }
  }

  if (failedAirports.length > 0) {
    store.mergeWithPrevious(result, "metar", failedAirports);
  }

  const saveResult = store.save("metar", result);
  return {
    type: "metar",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports
  };
}

module.exports = { processAll };

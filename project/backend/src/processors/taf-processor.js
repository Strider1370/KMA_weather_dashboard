const config = require("../config");
const apiClient = require("../api-client");
const store = require("../store");
const tafParser = require("../parsers/taf-parser");

async function processAll() {
  const result = {
    type: "TAF",
    fetched_at: new Date().toISOString(),
    airports: {}
  };

  const failedAirports = [];

  for (const airport of config.airports) {
    try {
      const xml = await apiClient.fetch("taf", airport.icao);
      const parsed = tafParser.parse(xml);
      if (parsed) {
        result.airports[airport.icao] = parsed;
      }
    } catch (error) {
      failedAirports.push(airport.icao);
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
    failedAirports
  };
}

module.exports = { processAll };

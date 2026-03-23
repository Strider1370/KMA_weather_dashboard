const apiClient = require("../api-client");
const store = require("../store");
const airmetParser = require("../parsers/airmet-parser");

async function process() {
  const xml = await apiClient.fetch("airmet");
  const items = airmetParser.parse(xml);
  const result = {
    type: "airmet",
    fetched_at: new Date().toISOString(),
    items
  };

  const saveResult = store.save("airmet", result);
  return {
    type: "airmet",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: items.length
  };
}

module.exports = { process };

const apiClient = require("../api-client");
const store = require("../store");
const sigmetParser = require("../parsers/sigmet-parser");

async function process() {
  const xml = await apiClient.fetch("sigmet");
  const items = sigmetParser.parse(xml);
  const result = {
    type: "sigmet",
    fetched_at: new Date().toISOString(),
    items
  };

  const saveResult = store.save("sigmet", result);
  return {
    type: "sigmet",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: items.length
  };
}

module.exports = { process };

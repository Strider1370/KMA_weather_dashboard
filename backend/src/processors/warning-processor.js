const apiClient = require("../api-client");
const store = require("../store");
const warningParser = require("../parsers/warning-parser");

async function process() {
  const xml = await apiClient.fetch("warning");
  const parsed = warningParser.parse(xml);
  const saveResult = store.save("warning", parsed);

  return {
    type: "warning",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    airports: Object.keys(parsed.airports || {}).length
  };
}

module.exports = { process };

const config = require("../config");
const apiClient = require("../api-client");
const store = require("../store");
const warningParser = require("../parsers/warning-parser");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function process() {
  const maxRetries = config.api.app_error_max_retries_warning;
  const retryMs = config.api.app_error_retry_ms;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(retryMs);
    try {
      const xml = await apiClient.fetch("warning");
      const parsed = warningParser.parse(xml);
      const saveResult = store.save("warning", parsed);
      return {
        type: "warning",
        saved: saveResult.saved,
        filePath: saveResult.filePath || null,
        airports: Object.keys(parsed.airports || {}).length
      };
    } catch (error) {
      if (!/APPLICATION_ERROR/.test(error.message)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

module.exports = { process };

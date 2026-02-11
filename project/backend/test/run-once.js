const config = require("../src/config");
const store = require("../src/store");
const metarProcessor = require("../src/processors/metar-processor");
const tafProcessor = require("../src/processors/taf-processor");
const warningProcessor = require("../src/processors/warning-processor");
const lightningProcessor = require("../src/processors/lightning-processor");
const radarProcessor = require("../src/processors/radar-processor");

async function main() {
  const target = (process.argv[2] || "all").toLowerCase();
  const allowed = new Set(["metar", "taf", "warning", "lightning", "radar", "all"]);

  if (!allowed.has(target)) {
    console.error("Usage: node backend/test/run-once.js [metar|taf|warning|lightning|radar|all]");
    process.exit(1);
  }

  store.ensureDirectories(config.storage.base_path);
  store.initFromFiles(config.storage.base_path);

  const results = [];
  async function execute(name, fn) {
    try {
      const result = await fn();
      results.push({ name, ok: true, result });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }

  if (target === "metar" || target === "all") {
    await execute("metar", () => metarProcessor.processAll());
  }

  if (target === "taf" || target === "all") {
    await execute("taf", () => tafProcessor.processAll());
  }

  if (target === "warning" || target === "all") {
    await execute("warning", () => warningProcessor.process());
  }

  if (target === "lightning" || target === "all") {
    await execute("lightning", () => lightningProcessor.process());
  }

  if (target === "radar" || target === "all") {
    await execute("radar", () => radarProcessor.process());
  }

  console.log(JSON.stringify({ target, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

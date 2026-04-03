const config = require("../src/config");
const store = require("../src/store");
const metarProcessor = require("../src/processors/metar-processor");
const tafProcessor = require("../src/processors/taf-processor");
const warningProcessor = require("../src/processors/warning-processor");
const sigmetProcessor = require("../src/processors/sigmet-processor");
const airmetProcessor = require("../src/processors/airmet-processor");
const sigwxLowProcessor = require("../src/processors/sigwx-low-processor");
const amosProcessor = require("../src/processors/amos-processor");
const lightningProcessor = require("../src/processors/lightning-processor");
const radarEchoProcessor = require("../src/processors/radar-echo-processor");
const adsbProcessor = require("../src/processors/adsb-processor");
const satelliteProcessor = require("../src/processors/satellite-processor");
const groundForecastProcessor = require("../src/processors/ground-forecast-processor");

async function main() {
  const target = (process.argv[2] || "all").toLowerCase();
  const allowed = new Set(["metar", "taf", "warning", "sigmet", "airmet", "sigwx-low", "amos", "lightning", "radar-echo", "adsb", "satellite", "ground-forecast", "all"]);

  if (!allowed.has(target)) {
    console.error("Usage: node backend/test/run-once.js [metar|taf|warning|sigmet|airmet|sigwx-low|amos|lightning|radar-echo|adsb|satellite|ground-forecast|all]");
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

  if (target === "sigmet" || target === "all") {
    await execute("sigmet", () => sigmetProcessor.process());
  }

  if (target === "airmet" || target === "all") {
    await execute("airmet", () => airmetProcessor.process());
  }

  if (target === "sigwx-low" || target === "all") {
    await execute("sigwx-low", () => sigwxLowProcessor.process());
  }

  if (target === "amos" || target === "all") {
    await execute("amos", () => amosProcessor.process());
  }

  if (target === "lightning" || target === "all") {
    await execute("lightning", () => lightningProcessor.processBackfill());
  }

  if (target === "radar-echo" || target === "all") {
    await execute("radar-echo", () => radarEchoProcessor.process());
  }

  if (target === "adsb" || target === "all") {
    await execute("adsb", () => adsbProcessor.process());
  }

  if (target === "satellite" || target === "all") {
    await execute("satellite", () => satelliteProcessor.process());
  }

  if (target === "ground-forecast" || target === "all") {
    await execute("ground-forecast", () => groundForecastProcessor.process());
  }

  console.log(JSON.stringify({ target, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

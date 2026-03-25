const cron = require("node-cron");
const config = require("./config");
const store = require("./store");
const stats = require("./stats");
const metarProcessor = require("./processors/metar-processor");
const tafProcessor = require("./processors/taf-processor");
const warningProcessor = require("./processors/warning-processor");
const sigmetProcessor = require("./processors/sigmet-processor");
const airmetProcessor = require("./processors/airmet-processor");
const amosProcessor = require("./processors/amos-processor");
const lightningProcessor = require("./processors/lightning-processor");
const radarEchoProcessor = require("./processors/radar-echo-processor");
const adsbProcessor = require("./processors/adsb-processor");

const locks = { metar: false, taf: false, warning: false, sigmet: false, airmet: false, amos: false, lightning: false, radar_echo: false, adsb: false };

async function runWithLock(type, job) {
  if (locks[type]) {
    console.warn(`${type}: skipped (already running)`);
    return;
  }

  locks[type] = true;
  try {
    const result = await job();
    console.log(`[${new Date().toISOString()}] ${type}:`, result);
    stats.recordSuccess(type, result);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${type} failed:`, error.message);
    stats.recordFailure(type, error.message);
  } finally {
    locks[type] = false;
  }
}

async function main() {
  store.ensureDirectories(config.storage.base_path);
  store.initFromFiles(config.storage.base_path);
  stats.initFromFile(config.storage.base_path);

  console.log("Scheduler started");

  cron.schedule(config.schedule.metar_interval, () => runWithLock("metar", metarProcessor.processAll));
  cron.schedule(config.schedule.taf_interval, () => runWithLock("taf", tafProcessor.processAll));
  cron.schedule(config.schedule.warning_interval, () => runWithLock("warning", warningProcessor.process));
  cron.schedule(config.schedule.sigmet_interval, () => runWithLock("sigmet", sigmetProcessor.process));
  cron.schedule(config.schedule.airmet_interval, () => runWithLock("airmet", airmetProcessor.process));
  cron.schedule(config.schedule.amos_interval, () => runWithLock("amos", amosProcessor.process));
  cron.schedule(config.schedule.lightning_interval, () => runWithLock("lightning", lightningProcessor.process));
  cron.schedule(config.schedule.radar_echo_interval, () => runWithLock("radar_echo", radarEchoProcessor.process));
  cron.schedule(config.schedule.adsb_interval, () => runWithLock("adsb", adsbProcessor.process));

  // 서버 시작 직후 1회 즉시 수집
  console.log("Running initial data collection...");
  await Promise.allSettled([
    runWithLock("metar", metarProcessor.processAll),
    runWithLock("taf", tafProcessor.processAll),
    runWithLock("warning", warningProcessor.process),
    runWithLock("sigmet", sigmetProcessor.process),
    runWithLock("airmet", airmetProcessor.process),
    runWithLock("amos", amosProcessor.process),
    runWithLock("lightning", lightningProcessor.process),
    runWithLock("radar_echo", radarEchoProcessor.process),
    runWithLock("adsb", adsbProcessor.process),
  ]);
  console.log("Initial data collection complete.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main, runWithLock };

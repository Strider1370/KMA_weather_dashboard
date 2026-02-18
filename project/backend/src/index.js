const cron = require("node-cron");
const config = require("./config");
const store = require("./store");
const metarProcessor = require("./processors/metar-processor");
const tafProcessor = require("./processors/taf-processor");
const warningProcessor = require("./processors/warning-processor");
const lightningProcessor = require("./processors/lightning-processor");
const radarProcessor = require("./processors/radar-processor");

const locks = { metar: false, taf: false, warning: false, lightning: false, radar: false };

async function runWithLock(type, job) {
  if (locks[type]) {
    console.warn(`${type}: skipped (already running)`);
    return;
  }

  locks[type] = true;
  try {
    const result = await job();
    console.log(`[${new Date().toISOString()}] ${type}:`, result);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${type} failed:`, error.message);
  } finally {
    locks[type] = false;
  }
}

async function main() {
  store.ensureDirectories(config.storage.base_path);
  store.initFromFiles(config.storage.base_path);

  console.log("Scheduler started");

  cron.schedule(config.schedule.metar_interval, () => runWithLock("metar", metarProcessor.processAll));
  cron.schedule(config.schedule.taf_interval, () => runWithLock("taf", tafProcessor.processAll));
  cron.schedule(config.schedule.warning_interval, () => runWithLock("warning", warningProcessor.process));
  cron.schedule(config.schedule.lightning_interval, () => runWithLock("lightning", lightningProcessor.process));
  cron.schedule(config.schedule.radar_interval, () => runWithLock("radar", radarProcessor.process));

  // 서버 시작 직후 1회 즉시 수집
  console.log("Running initial data collection...");
  await Promise.allSettled([
    runWithLock("metar", metarProcessor.processAll),
    runWithLock("taf", tafProcessor.processAll),
    runWithLock("warning", warningProcessor.process),
    runWithLock("lightning", lightningProcessor.process),
    runWithLock("radar", radarProcessor.process),
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

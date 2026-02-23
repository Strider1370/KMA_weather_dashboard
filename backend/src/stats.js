"use strict";

const fs = require("fs");
const path = require("path");

const TYPES = ["metar", "taf", "warning", "lightning", "radar"];
const MAX_RECENT_RUNS = 50;

// In-memory only — cleared when a run completes (not persisted to disk)
const retryState = {};

// RKSI observes every 30 min; all others observe every hour.
function getExpectedMetarTime(icao, now) {
  const d = new Date(now);
  const windowMin = (icao === "RKSI" && d.getUTCMinutes() >= 30) ? 30 : 0;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), windowMin));
}

function makeTypeEntry() {
  return {
    total_runs: 0,
    success: 0,
    failure: 0,
    last_run: null,
    last_failure: null,
    last_error: null,
    error_counts: {},
    airport_failures: {}
  };
}

let statsData = {
  since: new Date().toISOString(),
  types: Object.fromEntries(TYPES.map(t => [t, makeTypeEntry()])),
  recent_runs: []
};

let statsFilePath = null;

function initFromFile(basePath) {
  const dir = path.join(basePath, "stats");
  statsFilePath = path.join(dir, "latest.json");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(statsFilePath)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(statsFilePath, "utf8"));
      // 누락 타입 보정 (이전 버전 파일 호환)
      if (!loaded.types) loaded.types = {};
      for (const t of TYPES) {
        if (!loaded.types[t]) loaded.types[t] = makeTypeEntry();
        if (!loaded.types[t].error_counts) loaded.types[t].error_counts = {};
        if (!loaded.types[t].airport_failures) loaded.types[t].airport_failures = {};
        if (!loaded.types[t].airport_error_counts) loaded.types[t].airport_error_counts = {};
      }
      // metar 전용 정시 수신 통계 필드 보정
      if (!loaded.types.metar.airport_ontime) loaded.types.metar.airport_ontime = {};
      if (!loaded.types.metar.airport_late) loaded.types.metar.airport_late = {};
      if (!Array.isArray(loaded.recent_runs)) loaded.recent_runs = [];
      statsData = loaded;
    } catch (e) {
      console.warn("[STATS] Failed to load stats file, starting fresh:", e.message);
    }
  }
}

function saveToFile() {
  if (!statsFilePath) return;
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2), "utf8");
  } catch (e) {
    console.warn("[STATS] Failed to save stats file:", e.message);
  }
}

function addRecentRun(type, success, error, failedAirports, startTime) {
  const endTime = new Date().toISOString();
  statsData.recent_runs.unshift({
    type,
    start_time: startTime || endTime,
    time: endTime,
    success,
    error: error || null,
    failed_airports: failedAirports || []
  });
  if (statsData.recent_runs.length > MAX_RECENT_RUNS) {
    statsData.recent_runs = statsData.recent_runs.slice(0, MAX_RECENT_RUNS);
  }
}

function setRetryState(type, staleIcaos, attempt, maxRetries) {
  retryState[type] = { stale_icaos: staleIcaos, attempt, max_retries: maxRetries };
}

function clearRetryState(type) {
  delete retryState[type];
}

function recordSuccess(type, result, startTime) {
  clearRetryState(type);

  const entry = statsData.types[type];
  if (!entry) return;

  entry.total_runs++;
  entry.success++;
  entry.last_run = new Date().toISOString();

  const failedAirports = Array.isArray(result?.failedAirports) ? result.failedAirports : [];
  for (const icao of failedAirports) {
    entry.airport_failures[icao] = (entry.airport_failures[icao] || 0) + 1;
  }

  // 공항별 에러 메시지 집계
  if (result?.airportErrors && typeof result.airportErrors === "object") {
    if (!entry.airport_error_counts) entry.airport_error_counts = {};
    for (const [icao, errMsg] of Object.entries(result.airportErrors)) {
      if (!entry.airport_error_counts[icao]) entry.airport_error_counts[icao] = {};
      const key = errMsg || "Unknown error";
      entry.airport_error_counts[icao][key] = (entry.airport_error_counts[icao][key] || 0) + 1;
    }
  }

  // METAR 정시 수신 통계: 정시 관측 윈도우 기준 (SPECI 제외)
  // RKSI는 30분 주기, 그 외는 60분 주기 윈도우
  if (type === "metar" && result?.airportObsTimes) {
    if (!entry.airport_ontime) entry.airport_ontime = {};
    if (!entry.airport_late) entry.airport_late = {};
    const now = new Date();
    for (const [icao, info] of Object.entries(result.airportObsTimes)) {
      if (!info.observation_time) continue;
      if (info.report_type === "SPECI") continue;
      const expected = getExpectedMetarTime(icao, now);
      if (new Date(info.observation_time) < expected) {
        entry.airport_late[icao] = (entry.airport_late[icao] || 0) + 1;
      } else {
        entry.airport_ontime[icao] = (entry.airport_ontime[icao] || 0) + 1;
      }
    }
  }

  addRecentRun(type, true, null, failedAirports, startTime);
  saveToFile();
}

function recordFailure(type, errorMsg, startTime) {
  clearRetryState(type);

  const entry = statsData.types[type];
  if (!entry) return;

  const now = new Date().toISOString();
  entry.total_runs++;
  entry.failure++;
  entry.last_run = now;
  entry.last_failure = now;
  entry.last_error = errorMsg || "Unknown error";

  const key = errorMsg || "Unknown error";
  entry.error_counts[key] = (entry.error_counts[key] || 0) + 1;

  addRecentRun(type, false, errorMsg, [], startTime);
  saveToFile();
}

function getStats() {
  return { ...statsData, retry_state: retryState };
}

module.exports = { initFromFile, recordSuccess, recordFailure, getStats, setRetryState, clearRetryState };

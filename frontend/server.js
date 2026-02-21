import fs from "fs";
import path from "path";
import http from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = require("../backend/src/store");

const PORT = Number(process.env.PORT || 5173);
const ROOT = path.join(__dirname, "dist");
const DATA_ROOT = path.resolve(__dirname, "../backend/data");
const TST1_ROOT = path.join(DATA_ROOT, "TST1");
const SHARED_AIRPORTS = path.resolve(__dirname, "../shared/airports.js");
const SHARED_WARNING_TYPES = path.resolve(__dirname, "../shared/warning-types.js");
const SHARED_ALERT_DEFAULTS = path.resolve(__dirname, "../shared/alert-defaults.js");

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function readLatest(category) {
  const cached = store.getCached(category);
  if (cached !== null) return cached;

  // cold start 폴백: 캐시가 아직 채워지지 않은 경우에만 디스크 읽기
  const file = path.join(DATA_ROOT, category, "latest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readTst1Override(category) {
  const file = path.join(TST1_ROOT, `${category}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[TST1] Invalid JSON for ${category}: ${error.message}`);
    return null;
  }
}

function mergeTst1(payload, category) {
  const override = readTst1Override(category);
  if (!override) return payload;

  const next = payload && typeof payload === "object" ? { ...payload } : {};
  next.airports = next.airports && typeof next.airports === "object" ? { ...next.airports } : {};

  let airportData = override.airports?.TST1 ?? override;

  // 낙뢰 데이터인 경우, 시각이 필터링되지 않도록 현재 시각 기준으로 시프트
  if (category === "lightning" && Array.isArray(airportData.strikes) && airportData.strikes.length > 0) {
    airportData = JSON.parse(JSON.stringify(airportData)); // deep clone
    const strikes = airportData.strikes;
    
    // 가장 최신 strike 시각 찾기
    const latestStrikeTime = Math.max(...strikes.map(s => new Date(s.time).getTime()));
    // 최신 strike가 현재로부터 5분 전이 되도록 오프셋 계산
    const offset = (Date.now() - 5 * 60 * 1000) - latestStrikeTime;

    strikes.forEach(s => {
      const newTime = new Date(new Date(s.time).getTime() + offset);
      s.time = newTime.toISOString();
      if (s.time_kst) {
        const kstTime = new Date(newTime.getTime() + 9 * 3600 * 1000);
        s.time_kst = kstTime.toISOString().replace("Z", "+09:00");
      }
    });

    if (airportData.summary) {
      airportData.summary.latest_time = strikes[0].time;
    }
  }

  next.airports.TST1 = airportData;
  if (!next.fetched_at && !next.updated_at) next.fetched_at = new Date().toISOString();
  return next;
}

function readLightning() {
  const cached = store.getCached("lightning");
  if (cached !== null) return mergeTst1(cached, "lightning");

  // cold start 폴백
  const latestFile = path.join(DATA_ROOT, "lightning", "latest.json");
  let payload = {
    type: "lightning",
    fetched_at: new Date().toISOString(),
    query: { itv_minutes: 3, range_km: 32 },
    airports: {}
  };

  if (fs.existsSync(latestFile)) {
    payload = JSON.parse(fs.readFileSync(latestFile, "utf8"));
    if (!payload.airports) payload.airports = {};
  }

  return mergeTst1(payload, "lightning");
}

function readRadar() {
  const radarDir = path.join(DATA_ROOT, "radar");
  const latestFile = path.join(radarDir, "latest.json");
  if (!fs.existsSync(latestFile)) {
    return {
      type: "RADAR",
      updated_at: null,
      image_count: 0,
      interval_minutes: 5,
      images: []
    };
  }

  const payload = JSON.parse(fs.readFileSync(latestFile, "utf8"));
  payload.images = Array.isArray(payload.images) ? payload.images : [];
  return payload;
}

function getDataStatus(category) {
  try {
    const dir = path.join(DATA_ROOT, category);
    if (!fs.existsSync(dir)) {
      return { exists: false, last_updated: null, file_count: 0 };
    }

    const filePattern = category === "radar"
      ? (name) => /^RDR_\d{12}\.png$/.test(name)
      : (name) => name.endsWith(".json") && name !== "latest.json";

    const files = fs.readdirSync(dir)
      .filter(filePattern)
      .map((name) => {
        const fullPath = path.join(dir, name);
        const stats = fs.statSync(fullPath);
        return { name, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    let lastUpdated = null;
    const latestFile = path.join(dir, "latest.json");
    if (fs.existsSync(latestFile)) {
      const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
      lastUpdated = data.fetched_at || data.updated_at || null;
    }

    return {
      exists: true,
      last_updated: lastUpdated,
      file_count: files.length,
      latest_file: files[0]?.name || null
    };
  } catch (error) {
    return { exists: false, last_updated: null, file_count: 0, error: error.message };
  }
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  return "text/plain; charset=utf-8";
}

function serveDataAsset(req, res) {
  const urlPath = req.url.split('?')[0];
  const relative = urlPath.replace(/^\/data\//, "");
  const filePath = path.normalize(path.join(DATA_ROOT, relative));
  if (!filePath.startsWith(DATA_ROOT)) {
    sendText(res, 403, "Forbidden");
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not Found");
    return true;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentTypeFor(filePath), "Cache-Control": "no-cache" });
  res.end(body);
  return true;
}

function serveStatic(req, res) {
  const target = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.normalize(path.join(ROOT, target));

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
  res.end(body);
}

function reloadCommonJs(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/metar") {
      return sendJson(res, 200, mergeTst1(readLatest("metar"), "metar"));
    }

    if (req.url === "/api/taf") {
      return sendJson(res, 200, mergeTst1(readLatest("taf"), "taf"));
    }

    if (req.url === "/api/warning") {
      return sendJson(res, 200, mergeTst1(readLatest("warning"), "warning"));
    }

    if (req.url === "/api/lightning") {
      return sendJson(res, 200, readLightning());
    }

    if (req.url === "/api/radar") {
      return sendJson(res, 200, readRadar());
    }

    if (req.url === "/api/airports") {
      const airports = reloadCommonJs(SHARED_AIRPORTS);
      return sendJson(res, 200, airports);
    }

    if (req.url === "/api/warning-types") {
      const warningTypes = reloadCommonJs(SHARED_WARNING_TYPES);
      return sendJson(res, 200, warningTypes);
    }

    if (req.url === "/api/alert-defaults") {
      const alertDefaults = reloadCommonJs(SHARED_ALERT_DEFAULTS);
      return sendJson(res, 200, alertDefaults);
    }

    if (req.url === "/api/refresh" && req.method === "POST") {
      console.log("[REFRESH] Manual refresh triggered");
      const metarProcessor = require("../backend/src/processors/metar-processor");
      const tafProcessor = require("../backend/src/processors/taf-processor");
      const warningProcessor = require("../backend/src/processors/warning-processor");
      const lightningProcessor = require("../backend/src/processors/lightning-processor");
      const radarProcessor = require("../backend/src/processors/radar-processor");

      try {
        const results = await Promise.allSettled([
          metarProcessor.processAll(),
          tafProcessor.processAll(),
          warningProcessor.process(),
          lightningProcessor.process(),
          radarProcessor.process()
        ]);

        const summary = {
          metar: results[0].status === "fulfilled" ? results[0].value : { error: results[0].reason?.message },
          taf: results[1].status === "fulfilled" ? results[1].value : { error: results[1].reason?.message },
          warning: results[2].status === "fulfilled" ? results[2].value : { error: results[2].reason?.message },
          lightning: results[3].status === "fulfilled" ? results[3].value : { error: results[3].reason?.message },
          radar: results[4].status === "fulfilled" ? results[4].value : { error: results[4].reason?.message }
        };
        console.log("[REFRESH] Results:", JSON.stringify(summary, null, 2));
        return sendJson(res, 200, summary);
      } catch (refreshErr) {
        console.error("[REFRESH] Error:", refreshErr.message);
        return sendJson(res, 500, { error: refreshErr.message });
      }
    }

    if (req.url === "/api/status") {
      const status = {
        metar: getDataStatus("metar"),
        taf: getDataStatus("taf"),
        warning: getDataStatus("warning"),
        lightning: getDataStatus("lightning"),
        radar: getDataStatus("radar")
      };
      return sendJson(res, 200, status);
    }

    if (req.url.startsWith("/data/")) {
      return serveDataAsset(req, res);
    }

    return serveStatic(req, res);
  } catch (error) {
    console.error("[SERVER] Request error:", req.url, error.message);
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard server started: http://localhost:${PORT}`);

  const scheduler = require("../backend/src/index");
  scheduler.main().catch((err) => {
    console.error("Scheduler failed to start:", err);
  });
});

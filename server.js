import fs from "fs";
import path from "path";
import http from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const store = require("./backend/src/store");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting (in-memory, per IP)
const rateLimitMap = new Map();
const RATE_LIMIT = 120;       // requests per window
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

const PORT = Number(process.env.PORT || 5173);
const ROOT = path.join(__dirname, "frontend", "dist");
const DATA_ROOT = path.resolve(__dirname, "backend/data");
const TST1_ROOT = path.join(DATA_ROOT, "TST1");
const SHARED_AIRPORTS = path.resolve(__dirname, "shared/airports.js");
const SHARED_WARNING_TYPES = path.resolve(__dirname, "shared/warning-types.js");
const SHARED_ALERT_DEFAULTS = path.resolve(__dirname, "shared/alert-defaults.js");

function buildBaseHeaders(req) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
  };

  if (req.url.startsWith("/api/") || req.url.startsWith("/data/")) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }

  return headers;
}

function sendJson(req, res, status, payload) {
  res.writeHead(status, {
    ...buildBaseHeaders(req),
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(req, res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    ...buildBaseHeaders(req),
    "Content-Type": contentType
  });
  res.end(body);
}

function readLatest(category) {
  const cached = store.getCached(category);
  if (cached !== null) return cached;
  // cold start 폴백: initFromFiles() 전에 요청이 오는 경우
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
    sendText(req, res, 403, "Forbidden");
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(req, res, 404, "Not Found");
    return true;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    ...buildBaseHeaders(req),
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": "no-cache"
  });
  res.end(body);
  return true;
}

function serveStatic(req, res) {
  const target = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.normalize(path.join(ROOT, target));

  if (!filePath.startsWith(ROOT)) {
    sendText(req, res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(req, res, 404, "Not Found");
    return;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    ...buildBaseHeaders(req),
    "Content-Type": contentTypeFor(filePath)
  });
  res.end(body);
}

function reloadCommonJs(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, buildBaseHeaders(req));
      res.end();
      return;
    }

    const ip = req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return sendJson(req, res, 429, { error: "Too Many Requests" });
    }

    if (req.url === "/api/metar") {
      return sendJson(req, res, 200, mergeTst1(readLatest("metar"), "metar"));
    }

    if (req.url === "/api/taf") {
      return sendJson(req, res, 200, mergeTst1(readLatest("taf"), "taf"));
    }

    if (req.url === "/api/warning") {
      return sendJson(req, res, 200, mergeTst1(readLatest("warning"), "warning"));
    }

    if (req.url === "/api/lightning") {
      return sendJson(req, res, 200, readLightning());
    }

    if (req.url === "/api/radar") {
      return sendJson(req, res, 200, readRadar());
    }

    if (req.url === "/api/airports") {
      const airports = reloadCommonJs(SHARED_AIRPORTS);
      return sendJson(req, res, 200, airports);
    }

    if (req.url === "/api/warning-types") {
      const warningTypes = reloadCommonJs(SHARED_WARNING_TYPES);
      return sendJson(req, res, 200, warningTypes);
    }

    if (req.url === "/api/alert-defaults") {
      const alertDefaults = reloadCommonJs(SHARED_ALERT_DEFAULTS);
      return sendJson(req, res, 200, alertDefaults);
    }



    if (req.url.startsWith("/data/")) {
      return serveDataAsset(req, res);
    }

    return serveStatic(req, res);
  } catch (error) {
    console.error("[SERVER] Request error:", req.url, error.message);
    return sendJson(req, res, 500, { error: "Internal Server Error" });
  }
});

server.listen(PORT, () => {
   console.log(`Dashboard server started: http://localhost:${PORT}`);

   const scheduler = require("./backend/src/index");
  scheduler.main().catch((err) => {
    console.error("Scheduler failed to start:", err);
  });
});

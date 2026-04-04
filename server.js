import fs from "fs";
import path from "path";
import http from "http";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const store = require("./backend/src/store");
const config = require("./backend/src/config");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting (in-memory, per IP)
const rateLimitMap = new Map();
const RATE_LIMIT = 300;       // requests per window
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

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

const PORT = Number(process.env.PORT || 5173);
const ROOT = path.join(__dirname, "frontend", "dist");
const DATA_ROOT = path.resolve(__dirname, "backend/data");
const TST1_ROOT = path.join(DATA_ROOT, "TST1");
const SHARED_AIRPORTS = path.resolve(__dirname, "shared/airports.js");
const SHARED_WARNING_TYPES = path.resolve(__dirname, "shared/warning-types.js");
const SHARED_ALERT_DEFAULTS = path.resolve(__dirname, "shared/alert-defaults.js");
const FRAME_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const frameAssetCache = new Map();

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

function redirect(req, res, location, status = 302) {
  res.writeHead(status, {
    ...buildBaseHeaders(req),
    Location: location,
  });
  res.end();
}

function readJsonFile(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function readLatest(category) {
  const file = path.join(DATA_ROOT, category, "latest.json");
  const cached = store.getCached(category);

  if (!fs.existsSync(file)) return cached;

  try {
    const latest = readJsonFile(file);
    const diskHash = latest?.content_hash || store.canonicalHash(latest);
    const cachedHash = cached?.content_hash || (cached ? store.canonicalHash(cached) : null);

    if (cached !== null && cachedHash === diskHash) {
      return cached;
    }

    store.updateCache(category, latest, diskHash);
    return latest;
  } catch {
    return cached;
  }
}

function readSnapshotHash(category) {
  const file = path.join(DATA_ROOT, category, "latest.json");
  if (!fs.existsSync(file)) return null;
  try {
    const latest = readJsonFile(file);
    return latest?.content_hash || null;
  } catch {
    return null;
  }
}

function readRecent(category, limit = 10) {
  const dir = path.join(DATA_ROOT, category);
  if (!fs.existsSync(dir)) return [];
  try {
    const historyPattern = category === "sigwx_low"
      ? /^SIGWX_LOW_.*\.json$/
      : null;

    return fs
      .readdirSync(dir)
      .filter((name) => {
        if (!name.endsWith(".json") || name === "latest.json") return false;
        if (historyPattern) return historyPattern.test(name);
        return true;
      })
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit)
      .map((name) => readJsonFile(path.join(dir, name)));
  } catch {
    return [];
  }
}

function readSigwxLowByTmfc(tmfc) {
  const normalized = String(tmfc || "").trim();
  if (!/^\d{10}$/.test(normalized)) return null;

  const latest = readLatest("sigwx_low");
  if (latest?.tmfc === normalized) return latest;

  const dir = path.join(DATA_ROOT, "sigwx_low");
  if (!fs.existsSync(dir)) return null;

  try {
    const names = fs
      .readdirSync(dir)
      .filter((name) => /^SIGWX_LOW_\d{10}\.json$/.test(name))
      .sort((a, b) => b.localeCompare(a));

    for (const name of names) {
      const payload = readJsonFile(path.join(dir, name));
      if (payload?.tmfc === normalized) return payload;
    }
  } catch {
    return null;
  }

  return null;
}

function readSigwxOverlayMeta(kind, tmfc) {
  const normalized = String(tmfc || "").trim();
  if (!/^\d{10}$/.test(normalized)) return null;
  const prefix = kind === "clouds" ? "clouds_meta_" : "fronts_meta_";
  const file = path.join(DATA_ROOT, "sigwx_low", `${prefix}${normalized}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return readJsonFile(file);
  } catch {
    return null;
  }
}

function readTst1Override(category) {
  const file = path.join(TST1_ROOT, `${category}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return readJsonFile(file);
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
    query: {
      itv_minutes: config.lightning.itv_minutes,
      nationwide_range_km: config.lightning.nationwide?.range_km || null,
    },
    history_window_minutes: 240,
    airports: {},
    nationwide: {
      summary: {
        total_count: 0,
        by_zone: { alert: 0, danger: 0, caution: 0 },
        by_type: { ground: 0, cloud: 0 },
        max_intensity: null,
        latest_time: null
      },
      strikes: []
    }
  };
  if (fs.existsSync(latestFile)) {
    payload = readJsonFile(latestFile);
    if (!payload.airports) payload.airports = {};
    if (!payload.nationwide) {
      payload.nationwide = {
        summary: {
          total_count: 0,
          by_zone: { alert: 0, danger: 0, caution: 0 },
          by_type: { ground: 0, cloud: 0 },
          max_intensity: null,
          latest_time: null
        },
        strikes: []
      };
    }
  }
  return mergeTst1(payload, "lightning");
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".geojson")) return "application/geo+json; charset=utf-8";
  if (filePath.endsWith(".topojson")) return "application/topo+json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "text/plain; charset=utf-8";
}

function isFrameAsset(filePath) {
  return /[\\/](radar[\\/]echo_korea_\d{12}\.png|satellite[\\/]sat_korea_\d{12}\.webp)$/.test(filePath);
}

function pruneFrameAssetCache(now = Date.now()) {
  for (const [key, entry] of frameAssetCache.entries()) {
    if ((now - entry.cachedAt) > FRAME_CACHE_TTL_MS) {
      frameAssetCache.delete(key);
    }
  }
}

function readDataAsset(filePath) {
  if (!isFrameAsset(filePath)) {
    return fs.readFileSync(filePath);
  }

  const now = Date.now();
  pruneFrameAssetCache(now);

  const stat = fs.statSync(filePath);
  const cached = frameAssetCache.get(filePath);
  if (
    cached &&
    (now - cached.cachedAt) <= FRAME_CACHE_TTL_MS &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.size === stat.size
  ) {
    return cached.body;
  }

  const body = fs.readFileSync(filePath);
  frameAssetCache.set(filePath, {
    body,
    cachedAt: now,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  });
  return body;
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

  const body = readDataAsset(filePath);
  const cacheControl = isFrameAsset(filePath)
    ? "public, max-age=10800"
    : "no-cache";
  res.writeHead(200, {
    ...buildBaseHeaders(req),
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": cacheControl
  });
  res.end(body);
  return true;
}

function serveStatic(req, res) {
  const pathname = req.url.split("?")[0];
  if (pathname === "/") {
    redirect(req, res, "/ops");
    return;
  }

  const spaEntryPaths = new Set(["/ops", "/ground", "/test"]);
  const target = spaEntryPaths.has(pathname) ? "/index.html" : pathname;
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
  const versionedGeoPattern = /[\\/]geo[\\/].+\.v\d+\.(?:geo|topo)json$/;
  const cacheControl = versionedGeoPattern.test(filePath)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
  res.writeHead(200, {
    ...buildBaseHeaders(req),
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": cacheControl
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

    const ip = getClientIp(req);
    if (req.url.startsWith("/api/") && isRateLimited(ip)) {
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

    if (req.url === "/api/sigmet") {
      return sendJson(req, res, 200, readLatest("sigmet"));
    }

    if (req.url === "/api/airmet") {
      return sendJson(req, res, 200, readLatest("airmet"));
    }

    if (req.url === "/api/sigwx-low") {
      return sendJson(req, res, 200, readLatest("sigwx_low"));
    }

    if (req.url === "/api/sigwx-low-history") {
      return sendJson(req, res, 200, readRecent("sigwx_low", 10));
    }

    if (req.url.startsWith("/api/sigwx-low-fronts")) {
      const reqUrl = new URL(req.url, "http://localhost");
      const tmfc = reqUrl.searchParams.get("tmfc") || readLatest("sigwx_low")?.tmfc || null;
      return sendJson(req, res, 200, readSigwxOverlayMeta("fronts", tmfc));
    }

    if (req.url.startsWith("/api/sigwx-low-clouds")) {
      const reqUrl = new URL(req.url, "http://localhost");
      const tmfc = reqUrl.searchParams.get("tmfc") || readLatest("sigwx_low")?.tmfc || null;
      return sendJson(req, res, 200, readSigwxOverlayMeta("clouds", tmfc));
    }

    if (req.url === "/api/amos") {
      return sendJson(req, res, 200, mergeTst1(readLatest("amos"), "amos"));
    }

    if (req.url === "/api/lightning") {
      return sendJson(req, res, 200, readLightning());
    }

    if (req.url === "/api/adsb") {
      return sendJson(req, res, 200, readLatest("adsb"));
    }

    if (req.url === "/api/ground-forecast") {
      return sendJson(req, res, 200, readLatest("ground_forecast"));
    }

    if (req.url === "/api/ground-overview") {
      return sendJson(req, res, 200, readLatest("ground_overview"));
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

    if (req.url === "/api/snapshot-meta") {
      const echoMetaPath = path.join(DATA_ROOT, "radar", "echo_meta.json");
      let echoTm = null;
      try {
        if (fs.existsSync(echoMetaPath)) {
          const echoMeta = readJsonFile(echoMetaPath);
          echoTm = echoMeta.tm || null;
        }
      } catch {
        echoTm = null;
      }
      const satMetaPath = path.join(DATA_ROOT, "satellite", "sat_meta.json");
      let satTm = null;
      try {
        if (fs.existsSync(satMetaPath)) {
          const satMeta = readJsonFile(satMetaPath);
          satTm = satMeta.tm || null;
        }
      } catch {
        satTm = null;
      }
      return sendJson(req, res, 200, {
        metar: { hash: readSnapshotHash("metar") },
        taf: { hash: readSnapshotHash("taf") },
        warning: { hash: readSnapshotHash("warning") },
        sigmet: { hash: readSnapshotHash("sigmet") },
        airmet: { hash: readSnapshotHash("airmet") },
        sigwx_low: { hash: readSnapshotHash("sigwx_low") },
        amos: { hash: readSnapshotHash("amos") },
        lightning: { hash: readSnapshotHash("lightning") },
        adsb: { hash: readSnapshotHash("adsb") },
        ground_forecast: { hash: readSnapshotHash("ground_forecast") },
        ground_overview: { hash: readSnapshotHash("ground_overview") },
        echo: echoTm != null ? { tm: echoTm } : null,
        satellite: satTm != null ? { tm: satTm } : null,
      });
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard server started: http://localhost:${PORT}`);

  const scheduler = require("./backend/src/index");
  scheduler.main().catch((err) => {
    console.error("Scheduler failed to start:", err);
  });
});

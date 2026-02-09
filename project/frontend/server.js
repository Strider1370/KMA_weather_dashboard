const fs = require("fs");
const path = require("path");
const http = require("http");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DATA_ROOT = path.resolve(__dirname, "../backend/data");
const SHARED_AIRPORTS = path.resolve(__dirname, "../shared/airports.js");
const SHARED_WARNING_TYPES = path.resolve(__dirname, "../shared/warning-types.js");

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function readLatest(category) {
  const file = path.join(DATA_ROOT, category, "latest.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function getDataStatus(category) {
  try {
    const dir = path.join(DATA_ROOT, category);
    if (!fs.existsSync(dir)) {
      return { exists: false, last_updated: null, file_count: 0 };
    }

    const files = fs.readdirSync(dir)
      .filter(name => name.endsWith(".json") && name !== "latest.json")
      .map(name => {
        const fullPath = path.join(dir, name);
        const stats = fs.statSync(fullPath);
        return { name, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    let lastUpdated = null;
    const latestFile = path.join(dir, "latest.json");
    if (fs.existsSync(latestFile)) {
      const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
      lastUpdated = data.fetched_at || null;
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
  return "text/plain; charset=utf-8";
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

const server = http.createServer((req, res) => {
  try {
    if (req.url === "/api/metar") {
      return sendJson(res, 200, readLatest("metar"));
    }

    if (req.url === "/api/taf") {
      return sendJson(res, 200, readLatest("taf"));
    }

    if (req.url === "/api/warning") {
      return sendJson(res, 200, readLatest("warning"));
    }

    if (req.url === "/api/airports") {
      delete require.cache[SHARED_AIRPORTS];
      const airports = require(SHARED_AIRPORTS);
      return sendJson(res, 200, airports);
    }

    if (req.url === "/api/warning-types") {
      delete require.cache[SHARED_WARNING_TYPES];
      const warningTypes = require(SHARED_WARNING_TYPES);
      return sendJson(res, 200, warningTypes);
    }

    if (req.url === "/api/status") {
      const status = {
        metar: getDataStatus("metar"),
        taf: getDataStatus("taf"),
        warning: getDataStatus("warning")
      };
      return sendJson(res, 200, status);
    }

    return serveStatic(req, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard server started: http://localhost:${PORT}`);

  // Start backend scheduler automatically
  const scheduler = require("../backend/src/index");
  scheduler.main().catch(err => {
    console.error("Scheduler failed to start:", err);
  });
});

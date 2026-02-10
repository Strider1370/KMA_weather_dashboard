const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const TYPES = ["metar", "taf", "warning"];
const FILE_PREFIX = {
  metar: "METAR",
  taf: "TAF",
  warning: "WARNINGS"
};

const cache = {
  metar: { hash: null, prev_data: null },
  taf: { hash: null, prev_data: null },
  warning: { hash: null, prev_data: null }
};

function ensureDirectories(basePath) {
  for (const type of TYPES) {
    fs.mkdirSync(path.join(basePath, type), { recursive: true });
  }
}

function getTypeDir(basePath, type) {
  return path.join(basePath, type);
}

function formatFileTimestamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}${ms}Z`;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function rotateFiles(dir, maxCount = config.storage.max_files_per_category) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "latest.json")
    .map((name) => ({
      name,
      fullPath: path.join(dir, name)
    }))
    .sort((a, b) => b.name.localeCompare(a.name));

  for (const file of files.slice(maxCount)) {
    fs.unlinkSync(file.fullPath);
  }
}

function saveAndUpdateLatest(dir, filename, data) {
  const filePath = path.join(dir, filename);
  writeJson(filePath, data);

  const latestPath = path.join(dir, "latest.json");
  writeJson(latestPath, data);

  rotateFiles(dir);
  return filePath;
}

function loadLatest(dir) {
  const latestPath = path.join(dir, "latest.json");
  if (!fs.existsSync(latestPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(latestPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).sort();

    for (const key of keys) {
      if (key === "fetched_at" || key === "type" || key === "_stale") {
        continue;
      }
      out[key] = canonicalize(value[key]);
    }

    return out;
  }

  return value;
}

function canonicalHash(result) {
  const canonical = canonicalize(result);
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function shouldSave(type, data) {
  const newHash = canonicalHash(data);
  return {
    changed: cache[type].hash !== newHash,
    hash: newHash
  };
}

function mergeWithPrevious(result, type, failedAirports) {
  if (!result || !result.airports || !Array.isArray(failedAirports) || failedAirports.length === 0) {
    return result;
  }

  const prev = cache[type].prev_data;
  if (!prev || !prev.airports) {
    return result;
  }

  for (const icao of failedAirports) {
    if (prev.airports[icao]) {
      result.airports[icao] = {
        ...prev.airports[icao],
        _stale: true
      };
    }
  }

  return result;
}

function updateCache(type, data, hash) {
  cache[type].hash = hash;
  cache[type].prev_data = data;
}

function initFromFiles(basePath) {
  for (const type of TYPES) {
    const dir = getTypeDir(basePath, type);
    const latest = loadLatest(dir);

    if (latest) {
      updateCache(type, latest, canonicalHash(latest));
    }
  }
}

function save(type, data) {
  if (!TYPES.includes(type)) {
    throw new Error(`Unsupported type: ${type}`);
  }

  const basePath = config.storage.base_path;
  const dir = getTypeDir(basePath, type);
  ensureDirectories(basePath);

  const decision = shouldSave(type, data);
  if (!decision.changed) {
    // 데이터 동일해도 latest.json의 fetched_at만 갱신
    const latestPath = path.join(dir, "latest.json");
    if (fs.existsSync(latestPath)) {
      const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
      latest.fetched_at = data.fetched_at || new Date().toISOString();
      writeJson(latestPath, latest);
    }
    updateCache(type, data, decision.hash);
    return { saved: false, reason: "unchanged" };
  }

  const prefix = FILE_PREFIX[type] || type.toUpperCase();
  let filename = `${prefix}_${formatFileTimestamp()}.json`;
  let attempt = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${prefix}_${formatFileTimestamp()}_${attempt}.json`;
    attempt += 1;
  }
  const filePath = saveAndUpdateLatest(dir, filename, data);
  updateCache(type, data, decision.hash);

  return { saved: true, filePath };
}

module.exports = {
  cache,
  ensureDirectories,
  saveAndUpdateLatest,
  rotateFiles,
  loadLatest,
  canonicalHash,
  shouldSave,
  mergeWithPrevious,
  updateCache,
  initFromFiles,
  save
};

const path = require("path");
const dotenv = require("dotenv");
const allAirports = require("../../shared/airports");
const projectRoot = path.resolve(__dirname, "../..");

// Exclude mock/non-ICAO entries from backend KMA collection targets.
const airports = allAirports.filter((airport) => {
  const icao = String(airport.icao || "");
  return /^[A-Z]{4}$/.test(icao) && !airport.mock_only;
});

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function resolveDataPath(dataPath) {
  if (!dataPath) {
    return path.join(projectRoot, "backend", "data");
  }
  return path.isAbsolute(dataPath) ? dataPath : path.resolve(projectRoot, dataPath);
}

module.exports = {
  api: {
    base_url: process.env.API_BASE_URL || "https://apihub.kma.go.kr/api/typ02/openApi",
    lightning_url: process.env.LIGHTNING_API_URL || "https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php",
    radar_url: process.env.RADAR_API_URL || "https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php",
    endpoints: {
      metar: "/AmmIwxxmService/getMetar",
      taf: "/AmmIwxxmService/getTaf",
      warning: "/AmmService/getWarning"
    },
    auth_key: process.env.API_AUTH_KEY || "",
    default_params: { pageNo: 1, numOfRows: 10, dataType: "XML" },
    timeout_ms: 10000,
    max_retries: 3
  },
  airports,
  lightning: {
    range_km: 32,
    itv_minutes: 3,
    zones: {
      alert: 8,
      danger: 16,
      caution: 32
    }
  },
  radar: {
    cmp: "cmb",
    delay_minutes: 10,
    max_images: 36,
    interval_minutes: 5,
    timeout_ms: 15000
  },
  schedule: {
    metar_interval: "*/10 * * * *",
    taf_interval: "*/30 * * * *",
    warning_interval: "*/5 * * * *",
    lightning_interval: "*/3 * * * *",
    radar_interval: "*/5 * * * *"
  },
  storage: {
    base_path: resolveDataPath(process.env.DATA_PATH),
    max_files_per_category: 10
  }
};

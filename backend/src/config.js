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
    amos_url: process.env.AMOS_API_URL || "https://apihub.kma.go.kr/api/typ01/url/amos.php",
    radar_url: process.env.RADAR_API_URL || "https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php",
    endpoints: {
      metar: "/AmmIwxxmService/getMetar",
      taf: "/AmmIwxxmService/getTaf",
      warning: "/AmmService/getWarning",
      sigmet: "/AmmIwxxmService/getSigmet",
      airmet: "/AmmIwxxmService/getAirmet"
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
    nationwide: {
      lat: 36.2,
      lon: 127.8,
      range_km: 500
    },
    zones: {
      alert: 8,
      danger: 16,
      caution: 32
    }
  },
  amos: {
    dtm_minutes: 60,
    timeout_ms: 12000,
    stale_tolerance_minutes: 60
  },
  radar_echo: {
    cmp: (process.env.RADAR_CMP_TYPE || "hsr").toLowerCase(),
    delay_minutes: 10,
    max_images: 36,
    range_km: 100,
    crop_size: 200,
    timeout_ms: 30000
  },
  adsb: {
    url: process.env.ADSB_API_URL || "https://opensky-network.org/api/states/all",
    timeout_ms: 20000,
    max_history_frames: 36,
    bounds: {
      lamin: Number(process.env.ADSB_LAMIN || 33),
      lamax: Number(process.env.ADSB_LAMAX || 39),
      lomin: Number(process.env.ADSB_LOMIN || 124),
      lomax: Number(process.env.ADSB_LOMAX || 132)
    }
  },
  schedule: {
    metar_interval: "*/10 * * * *",
    taf_interval: "*/30 * * * *",
    warning_interval: "*/5 * * * *",
    sigmet_interval: "*/5 * * * *",
    airmet_interval: "*/5 * * * *",
    amos_interval: "*/10 * * * *",
    lightning_interval: "*/5 * * * *",
    radar_echo_interval: "*/5 * * * *",
    adsb_interval: "*/5 * * * *"
  },
  storage: {
    base_path: resolveDataPath(process.env.DATA_PATH),
    max_files_per_category: 10
  }
};

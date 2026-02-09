const path = require("path");
const dotenv = require("dotenv");
const airports = require("../../shared/airports");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

module.exports = {
  api: {
    base_url: process.env.API_BASE_URL || "https://apihub.kma.go.kr/api/typ02/openApi",
    endpoints: {
      metar: "/AmmIwxxmService/getMetar",
      taf: "/AmmIwxxmService/getTaf",
      warning: "/AmmService/getWarning"
    },
    auth_key: process.env.API_AUTH_KEY || "",
    default_params: { pageNo: 1, numOfRows: 500, dataType: "XML" },
    timeout_ms: 10000,
    max_retries: 3
  },
  airports,
  schedule: {
    metar_interval: "*/10 * * * *",
    taf_interval: "*/30 * * * *",
    warning_interval: "*/5 * * * *"
  },
  storage: {
    base_path: process.env.DATA_PATH || "./backend/data",
    max_files_per_category: 10
  }
};

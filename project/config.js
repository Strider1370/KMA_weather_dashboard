// config.js
module.exports = {
    api: {
        base_url: "https://apihub.kma.go.kr/api/typ02/openApi",
        endpoints: {
            metar: "/AmmIwxxmService/getMetar",
            taf: "/AmmIwxxmService/getTaf",
            warning: "/AmmService/getWarning"
        },
        auth_key: "boxdzlyoTGWMXc5cqDxlQQ",
        default_params: {
            pageNo: 1,
            numOfRows: 10,
            dataType: "XML"
        },
        timeout_ms: 10000,
        max_retries: 3
    },
    airports: [
        { icao: "RKSI", name: "인천공항" },
        { icao: "RKSS", name: "김포공항" },
        { icao: "RKPC", name: "제주공항" },
        { icao: "RKPK", name: "김해공항" },
        { icao: "RKJB", name: "무안공항" },
        { icao: "RKNY", name: "양양공항" },
        { icao: "RKPU", name: "울산공항" },
        { icao: "RKJY", name: "여수공항" }
    ],
    schedule: {
        metar_interval: "*/10 * * * *",
        taf_interval: "*/30 * * * *",
        warning_interval: "*/5 * * * *"
    },
    storage: {
        base_path: "./data",
        max_files_per_category: 10
    }
};

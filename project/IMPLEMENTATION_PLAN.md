# 항공기상 데이터 수집 시스템 — 구현 명세서

> **이 문서는 Claude Code가 읽고 프로젝트를 구현하기 위한 실행 계획서입니다.**
> 상세 알고리즘은 docs/ 폴더의 설계문서 5개에 정의되어 있으며, 이 문서는 전체 구조와 각 모듈의 구현 명세를 제공합니다.

---

## 0. 프로젝트 개요

KMA(기상청) API에서 TAF, METAR, 공항경보 데이터를 주기적으로 수집하여 IWXXM XML을 파싱하고, 시간별로 분해한 JSON 파일을 로컬에 저장하는 Node.js 백엔드 시스템.

### 참조 설계문서 (반드시 읽을 것)

| 문서 | 내용 | 구현 시 참조 대상 |
|------|------|-----------------|
| `TAF_Hourly_Resolution_Algorithm.md` | TAF 파싱, 시간별 분해, IWXXM XML 매핑 | taf-parser.js |
| `METAR_Parsing_Algorithm.md` | METAR 파싱, TAF와의 차이점 | metar-parser.js |
| `Warning_Parsing_Algorithm.md` | 공항경보 파싱, 유형 코드 매핑 | warning-parser.js |
| `Weather_Visualization_Mapping.md` | 기상현상→아이콘 키 매핑, Wind Barb 매핑 | parse-utils.js |
| `Scheduler_Cache_Design.md` | 스케줄러, 캐싱, 변경 감지, 파일 순환 | index.js, store.js |

---

## 1. 기술 스택

```json
{
  "runtime": "Node.js >= 18",
  "dependencies": {
    "node-cron": "^3.0.3",
    "fast-xml-parser": "^4.3.0",
    "dotenv": "^16.0.0"
  }
}
```

- `fast-xml-parser`: IWXXM XML 파싱 (네임스페이스 지원)
- `node-cron`: 주기적 실행
- `dotenv`: .env 환경변수 로드
- HTTP 요청: Node.js 내장 `fetch` (Node 18+)

---

## 2. 디렉토리 구조

```
aviation-weather/
│
├── backend/
│   ├── package.json
│   ├── .env                          ← 인증키 (git 제외)
│   ├── .env.example
│   │
│   ├── src/
│   │   ├── index.js                  ← 진입점 + 스케줄러 + 실행 락
│   │   ├── config.js                 ← .env + 기본값 병합
│   │   ├── api-client.js             ← API 호출 (fetch + 재시도 + 타임아웃)
│   │   ├── store.js                  ← 캐시 + 파일 저장 + 순환
│   │   │
│   │   ├── parsers/
│   │   │   ├── parse-utils.js        ← 공유 유틸 (weather-code, cloud, wind, time)
│   │   │   ├── metar-parser.js
│   │   │   ├── taf-parser.js
│   │   │   └── warning-parser.js
│   │   │
│   │   └── processors/
│   │       ├── metar-processor.js
│   │       ├── taf-processor.js
│   │       └── warning-processor.js
│   │
│   ├── test/
│   │   ├── run-once.js               ← 스케줄러 없이 1회 실행
│   │   └── fixtures/                 ← 테스트용 샘플 XML
│   │
│   └── data/                         ← JSON 출력 (git 제외)
│       ├── metar/
│       ├── taf/
│       └── warning/
│
├── shared/
│   ├── airports.js                   ← 공항 목록 + 좌표
│   ├── warning-types.js              ← 경보 유형 + 색상 + 소리
│   ├── weather-icons.js              ← 기상현상 → 아이콘 키
│   └── alert-defaults.js             ← 알림 시스템 기본 설정
│
├── frontend/
│   ├── ...                           ← 기존 프론트엔드 파일
│   └── src/alerts/                   ← 알림 시스템 모듈
│       ├── alert-triggers.js         ← 트리거 목록 (T-01 ~ T-07)
│       ├── alert-engine.js           ← 트리거 평가
│       ├── alert-state.js            ← 중복 방지 + 이력
│       ├── alert-dispatcher.js       ← 알림 형태별 실행
│       ├── alert-settings.js         ← 설정 병합 + localStorage
│       └── dispatchers/
│           ├── popup-alert.js        ← 팝업 알림
│           ├── sound-alert.js        ← 소리 알림
│           └── marquee-alert.js      ← 마퀴 알림
│
├── docs/                             ← 설계문서 6개 + 이 문서
├── assets/                           ← (추후) 아이콘, Wind Barb SVG
├── .gitignore
└── README.md
```

**백엔드 src 12개 + shared 4개 + 알림 모듈 8개 = 총 24개 파일**

### 데이터 흐름

```
index.js (cron 트리거)
    │
    ▼
processors/metar-processor.js
    ├── api-client.js           → XML 문자열
    ├── parsers/metar-parser.js → 파싱된 객체
    │       └── parse-utils.js   (공유 함수)
    └── store.js                → 캐시 비교 → 파일 저장
```

---

## 3. 환경변수 및 설정

### .env

```bash
API_AUTH_KEY=boxdzlyoTGWMXc5cqDxlQQ
API_BASE_URL=https://apihub.kma.go.kr/api/typ02/openApi
DATA_PATH=./data
```

### config.js

```javascript
require("dotenv").config();
const airports = require("../../shared/airports");

module.exports = {
    api: {
        base_url: process.env.API_BASE_URL || "https://apihub.kma.go.kr/api/typ02/openApi",
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
    schedule: {
        metar_interval: "*/10 * * * *",
        taf_interval: "*/30 * * * *",
        warning_interval: "*/5 * * * *"
    },
    storage: {
        base_path: process.env.DATA_PATH || "./data",
        max_files_per_category: 10
    }
};
```

### API 호출 URL 조립

```
METAR: {base_url}/AmmIwxxmService/getMetar?pageNo=1&numOfRows=10&dataType=XML&icao={ICAO}&authKey={auth_key}
TAF:   {base_url}/AmmIwxxmService/getTaf?pageNo=1&numOfRows=10&dataType=XML&icao={ICAO}&authKey={auth_key}
경보:  {base_url}/AmmService/getWarning?pageNo=1&numOfRows=10&dataType=XML&authKey={auth_key}
```

- METAR/TAF: 공항별 호출 (icao 파라미터)
- 경보: icao 없음 (전체 공항 일괄)

---

## 4. 모듈별 구현 명세

---

### 4.1 store.js

**역할**: 캐시(메모리) + 파일 저장 + latest.json 갱신 + 파일 순환 + canonical hash

```javascript
const cache = {
    metar:   { hash: null, prev_data: null },
    taf:     { hash: null, prev_data: null },
    warning: { hash: null, prev_data: null }
};

// 파일 관리
ensureDirectories(basePath)       // data/metar, data/taf, data/warning 생성
saveAndUpdateLatest(dir, filename, data)  // JSON 쓰기 + latest.json 덮어쓰기 + 순환
rotateFiles(dir, maxCount = 10)   // latest.json 제외, 오래된 파일 삭제
loadLatest(dir)                   // latest.json 읽기 (없으면 null)

// 캐시 관리
canonicalHash(result)             // airports만 해시 (fetched_at, type, _stale 제외)
shouldSave(type, data)            // 해시 비교 → 변경 여부
mergeWithPrevious(result, type, failedAirports)  // 실패 공항 이전 데이터 복구 (_stale 표시)
updateCache(type, data, hash)     // 캐시 갱신
initFromFiles(basePath)           // latest.json으로 캐시 초기화

// 통합 (processor가 호출)
save(type, data)                  // shouldSave → saveAndUpdateLatest → updateCache
```

---

### 4.2 parsers/warning-parser.js

**역할**: 경보 XML → JSON 객체
**참조**: `Warning_Parsing_Algorithm.md`

```javascript
const WARNING_TYPES = {
    "00": { key: "WIND_SHEAR",    name: "급변풍경보" },
    "1":  { key: "LOW_VISIBILITY", name: "저시정경보" },
    "2":  { key: "STRONG_WIND",    name: "강풍경보" },
    "3":  { key: "HEAVY_RAIN",     name: "호우경보" },
    "4":  { key: "LOW_CEILING",    name: "구름고도경보" },
    "5":  { key: "THUNDERSTORM",   name: "뇌우경보" },
    "7":  { key: "TYPHOON",        name: "태풍경보" },
    "8":  { key: "HEAVY_SNOW",     name: "대설경보" },
    "13": { key: "YELLOW_DUST",    name: "황사경보" }
};

parse(xmlString)
// 입력: API 응답 XML
// 출력:
{
    type: "AIRPORT_WARNINGS",
    fetched_at: "ISO 8601",
    total_count: Number,
    airports: {
        "RKPC": {
            airport_name: "제주공항",
            warnings: [{
                issued: "ISO 8601",
                wrng_type: "00",
                wrng_type_key: "WIND_SHEAR",
                wrng_type_name: "급변풍경보",
                valid_start: "ISO 8601",
                valid_end: "ISO 8601",
                raw_message: "원문"
            }]
        }
    }
}
```

---

### 4.3 parsers/metar-parser.js

**역할**: METAR IWXXM XML → JSON 객체
**참조**: `METAR_Parsing_Algorithm.md`, `Weather_Visualization_Mapping.md`

#### XML 구조

```
response > body > items > item
  ├ icaoCode
  ├ airportName
  └ metarMsg > iwxxm:METAR (파싱 대상)
```

#### 네임스페이스

```
iwxxm = "http://icao.int/iwxxm/2023-1"
gml   = "http://www.opengis.net/gml/3.2"
aixm  = "http://www.aixm.aero/schema/5.1.1"
xlink = "http://www.w3.org/1999/xlink"
```

#### 출력 형식

```javascript
{
    header: {
        icao: "RKSI",
        airport_name: "INCHEON INTERNATIONAL AIRPORT",
        issue_time: "ISO 8601",
        observation_time: "ISO 8601",
        automated: Boolean
    },
    observation: {
        wind: { raw, direction, speed, gust, unit, variable },
        visibility: { value, cavok },
        weather: [{ raw, intensity, descriptor, phenomena }],
        clouds: [{ amount, base, raw }],
        temperature: { air, dewpoint },
        qnh: { value, unit },
        display: { wind, visibility, weather, clouds, temperature, qnh }
    }
}
```

#### XML 매핑 핵심

| 필드 | XML 경로 | 비고 |
|------|---------|------|
| icao | `aixm:locationIndicatorICAO` | |
| observation_time | `iwxxm:observationTime > gml:TimeInstant > gml:timePosition` | ISO 8601 |
| CAVOK | `cloudAndVisibilityOK="true"` 속성 | true면 vis=9999, wx=[], clouds=[] |
| wind | `iwxxm:surfaceWind > iwxxm:AerodromeSurfaceWind` | TAF와 노드명 다름 |
| visibility | `iwxxm:visibility > iwxxm:prevailingVisibility` | TAF와 래퍼 다름 |
| weather | `iwxxm:presentWeather` (복수) | TAF는 `iwxxm:weather` |
| clouds | `iwxxm:cloud > iwxxm:AerodromeCloud > iwxxm:layer` | TAF는 `AerodromeCloudForecast` |
| temperature | `iwxxm:airTemperature`, `iwxxm:dewpointTemperature` | METAR 고유 |
| qnh | `iwxxm:qnh` | METAR 고유 |

---

### 4.4 parsers/taf-parser.js

**역할**: TAF IWXXM XML → 정규화 → 시간별 분해 → JSON 객체
**참조**: `TAF_Hourly_Resolution_Algorithm.md` (전체 — 반드시 정독)

**이 모듈이 가장 복잡합니다.**

#### XML 구조

```
response > body > items > item
  ├ icaoCode
  ├ airportName
  └ tafMsg > iwxxm:TAF (파싱 대상)
```

#### 파싱 파이프라인

```
XML → 헤더 추출 → baseForecast 추출 → changeForecast 순회
  → 정규화(CAVOK/NSW/NSC 전개)
  → touched 플래그 설정
  → 시간별 분해(메인 알고리즘)
  → NSW 후처리
  → display 문자열 생성
  → 객체 반환
```

#### 핵심 개념: touched 플래그

```
각 ChangeGroup에 wx_touched, clouds_touched (Boolean):
- XML에 해당 노드 존재 → true
- NSW/NSC nilReason → true
- 노드 없음 → false

partial_merge 시:
  if change.wx_touched === true → new_state.wx = change.wx ([]도 덮어씀)
  if change.wx_touched === false → 절대 변경 금지
```

#### 시간별 분해 알고리즘

```
1. valid_start ~ valid_end를 1시간 단위 슬롯 생성
2. 각 슬롯에 base_state 복사
3. BECMG: 시작 시각부터 base에 partial_merge (즉시 적용)
4. TEMPO/PROB: 해당 구간 슬롯에 오버라이드 (base 변경 없음)
5. NSW 후처리: TEMPO에서 wx=[]인 슬롯은 base.wx로 복원 안 함
```

#### DDhh → DateTime 변환 (기온 시각에 필수)

```javascript
resolveDdhh(ddhh, anchor)
// 기온(TX/TN) 시각이 DDhh 형식이므로 필수
// DD가 anchor.day보다 크게 앞서면(24시간 이상 과거) 다음 달로
// 윤년 고려
```

#### 출력 형식

```javascript
{
    header: {
        icao: "RKSI",
        airport_name: "INCHEON INTERNATIONAL AIRPORT",
        issued: "ISO 8601",
        valid_start: "ISO 8601",
        valid_end: "ISO 8601",
        temperatures: {
            max: { value: 3, time: "ISO 8601" },
            min: { value: -8, time: "ISO 8601" }
        }
    },
    timeline: [{
        time: "2026-02-08T06:00:00Z",
        wind: { raw, direction, speed, gust, unit, variable },
        visibility: { value, cavok },
        weather: [{ raw, intensity, descriptor, phenomena }],
        clouds: [{ amount, base, raw }],
        display: { wind, visibility, weather, clouds }
    }, ...]
}
```

---

### 4.5 processors/ (metar, taf, warning)

**역할**: API 호출 → parser → 부분 실패 복구 → 캐시 비교 → 저장

#### METAR/TAF 프로세서 (동일 패턴)

```javascript
async function processAll() {
    const result = {
        type: "METAR",
        fetched_at: new Date().toISOString(),
        airports: {}
    };
    const failedAirports = [];

    for (const airport of config.airports) {
        try {
            const xml = await apiClient.fetch("metar", airport.icao);
            result.airports[airport.icao] = metarParser.parse(xml);
        } catch (e) {
            failedAirports.push(airport.icao);
        }
    }

    if (failedAirports.length > 0)
        store.mergeWithPrevious(result, "metar", failedAirports);

    store.save("metar", result);
}
```

#### 경보 프로세서

```javascript
async function process() {
    const xml = await apiClient.fetch("warning");  // icao 없음
    const parsed = warningParser.parse(xml);
    store.save("warning", parsed);
}
```

---

### 4.6 index.js

**역할**: 초기화 + 스케줄러 + 실행 락

```javascript
const cron = require("node-cron");

// 실행 락
const locks = { metar: false, taf: false, warning: false };

async function runWithLock(type, job) {
    if (locks[type]) { console.warn(`${type}: 실행 중, 스킵`); return; }
    locks[type] = true;
    try { await job(); }
    finally { locks[type] = false; }
}

// 초기화
async function main() {
    store.ensureDirectories(config.storage.base_path);
    store.initFromFiles(config.storage.base_path);

    cron.schedule(config.schedule.metar_interval,   () => runWithLock("metar", metarProcessor.processAll));
    cron.schedule(config.schedule.taf_interval,     () => runWithLock("taf", tafProcessor.processAll));
    cron.schedule(config.schedule.warning_interval, () => runWithLock("warning", warningProcessor.process));
}
```

---

### 4.7 api-client.js

```javascript
async function fetchApi(type, icao = null) {
    const params = new URLSearchParams({ ...config.api.default_params, authKey: config.api.auth_key });
    if (icao) params.set("icao", icao);
    const url = `${config.api.base_url}${config.api.endpoints[type]}?${params}`;

    for (let attempt = 1; attempt <= config.api.max_retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.api.timeout_ms);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            return await response.text();
        } catch (e) {
            if (attempt < config.api.max_retries)
                await new Promise(r => setTimeout(r, attempt * 2000));
            else throw e;
        }
    }
}
```

---

### 4.8 parsers/parse-utils.js

METAR/TAF 파서가 공유하는 함수 모음.

```javascript
// 기상현상 코드 파싱
parseWeatherCode(code)
// URL에서 추출한 코드 (예: "-SHSN") → { raw, intensity, descriptor, phenomena }
// 강도: +/- /VC → HEAVY/LIGHT/VICINITY (없으면 MODERATE)
// 기술자: MI|BC|PR|DR|BL|SH|TS|FZ
// 현상: 나머지 2글자씩

// 구름 레이어 파싱
parseCloudLayer(layerNode)
// XML layer 노드 → { amount, base, raw }
// amount URL 마지막 세그먼트: FEW|SCT|BKN|OVC
// base: ft 단위 → 3자리 코드

// 바람 파싱
parseWind(windNode)
// XML surfaceWind 노드 → { raw, direction, speed, gust, unit, variable }

// DDhh → DateTime (기온 시각용)
resolveDdhh(ddhh, anchor)
// 24시간 이상 과거면 다음 달로, 윤년 고려

// 타임스탬프 포맷
formatTimestamp(date)
// Date → "20260208T101000Z"

// 구름 base 포맷
formatCloudBase(baseFt)
// 1500 → "015"
```

---

## 5. XML 파싱 설정 (fast-xml-parser)

```javascript
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,          // 네임스페이스 유지 (iwxxm:, gml: 등)
    isArray: (name) => {
        return [
            "iwxxm:changeForecast",
            "iwxxm:presentWeather",
            "iwxxm:weather",
            "iwxxm:layer",
            "item"
        ].includes(name);
    }
});
```

---

## 6. shared/ 상수 파일

### airports.js

```javascript
module.exports = [
    { icao: "RKSI", name: "인천공항",  lat: 37.4602, lon: 126.4407 },
    { icao: "RKSS", name: "김포공항",  lat: 37.5586, lon: 126.7906 },
    { icao: "RKPC", name: "제주공항",  lat: 33.5104, lon: 126.4929 },
    { icao: "RKPK", name: "김해공항",  lat: 35.1795, lon: 128.9382 },
    { icao: "RKJB", name: "무안공항",  lat: 34.9914, lon: 126.3828 },
    { icao: "RKNY", name: "양양공항",  lat: 38.0613, lon: 128.6692 },
    { icao: "RKPU", name: "울산공항",  lat: 35.5935, lon: 129.3518 },
    { icao: "RKJY", name: "여수공항",  lat: 34.8424, lon: 127.6162 }
];
```

### warning-types.js

```javascript
module.exports = {
    "00": { key: "WIND_SHEAR",    name: "급변풍경보",  color: "#FF4444", sound: "alert-critical" },
    "1":  { key: "LOW_VISIBILITY", name: "저시정경보",  color: "#FF8800", sound: "alert-warning" },
    "2":  { key: "STRONG_WIND",    name: "강풍경보",    color: "#FF6600", sound: "alert-warning" },
    "3":  { key: "HEAVY_RAIN",     name: "호우경보",    color: "#0088FF", sound: "alert-warning" },
    "4":  { key: "LOW_CEILING",    name: "구름고도경보", color: "#888888", sound: "alert-warning" },
    "5":  { key: "THUNDERSTORM",   name: "뇌우경보",    color: "#CC00FF", sound: "alert-critical" },
    "7":  { key: "TYPHOON",        name: "태풍경보",    color: "#FF0000", sound: "alert-critical" },
    "8":  { key: "HEAVY_SNOW",     name: "대설경보",    color: "#00CCFF", sound: "alert-warning" },
    "13": { key: "YELLOW_DUST",    name: "황사경보",    color: "#CC9900", sound: "alert-warning" }
};
```

### weather-icons.js

`Weather_Visualization_Mapping.md` 기반 48개 매핑. 구현 시 설계문서 참조.

---

## 7. 확장 가이드

### 새 데이터 소스 추가 (예: SIGMET)

```
추가:
  1. parsers/sigmet-parser.js
  2. processors/sigmet-processor.js

수정:
  3. config.js → 엔드포인트 + 폴링 주기
  4. index.js  → cron 1줄 추가
```

### 프론트엔드 추가

```
frontend/ 에 Next.js init
사용하는 것:
  - backend/data/*/latest.json (fetch)
  - shared/airports.js
  - shared/warning-types.js (알림 소리/색상)
  - shared/weather-icons.js (아이콘 매핑)
  - assets/ (SVG)
```

### .gitignore

```
.env
backend/data/
node_modules/
*.log
.DS_Store
.vscode/
```

---

## 8. 구현 순서 (체크포인트 기반)

각 체크포인트(CP)마다 검증 기준이 있다. 통과하면 다음으로 넘어간다.

---

### Phase 1: 프로젝트 기반

**CP-1: 프로젝트 초기화**
```
작업:
  - package.json 생성 (dependencies: node-cron, fast-xml-parser, dotenv)
  - npm install
  - .env, .env.example 생성
  - .gitignore 생성
  - 디렉토리 생성: backend/src/, backend/test/, backend/data/{metar,taf,warning}

검증:
  ✅ npm install 성공
  ✅ 디렉토리 구조가 2절과 일치
```

**CP-2: shared 상수 파일**
```
작업:
  - shared/airports.js (8개 공항 ICAO, 이름, 좌표)
  - shared/warning-types.js (9개 경보 유형, key, name, color, sound)
  - shared/weather-icons.js (기상현상 → 아이콘 키 매핑, Weather_Visualization_Mapping.md 참조)

검증:
  ✅ node -e "console.log(require('./shared/airports'))" → 8개 공항 출력
  ✅ node -e "console.log(require('./shared/warning-types'))" → 9개 유형 출력
```

**CP-3: config + api-client**
```
작업:
  - backend/src/config.js (.env 로드 + shared/airports import + 기본값)
  - backend/src/api-client.js (fetchApi 함수: URL 조립, fetch, 재시도 3회, 타임아웃 10초)

검증:
  ✅ node -e "console.log(require('./backend/src/config'))" → api, airports, schedule 출력
  ✅ 간단한 테스트 스크립트로 API 1회 호출 → XML 문자열 반환 확인
     예: node -e "require('./backend/src/api-client').fetch('metar','RKSI').then(console.log)"
```

**CP-4: store (캐시 + 파일 저장)**
```
작업:
  - backend/src/store.js
    - ensureDirectories, saveAndUpdateLatest, rotateFiles, loadLatest
    - canonicalHash, shouldSave, mergeWithPrevious, updateCache, initFromFiles
    - save (통합 함수)

검증:
  ✅ 테스트 데이터로 save 호출 → data/metar/latest.json 생성
  ✅ 동일 데이터 save 재호출 → 파일 생성 안 함 (해시 일치)
  ✅ 데이터 변경 후 save → 새 타임스탬프 파일 생성
  ✅ 12회 save → 파일 10개 + latest.json만 존재 (순환 동작)
```

---

### Phase 2: 파서 (단순 → 복잡)

**CP-5: parse-utils (공유 유틸)**
```
작업:
  - backend/src/parsers/parse-utils.js
    - parseWeatherCode, parseCloudLayer, parseWind
    - resolveDdhh, formatTimestamp, formatCloudBase

검증:
  ✅ parseWeatherCode("-SHSN") → { raw:"-SHSN", intensity:"LIGHT", descriptor:"SH", phenomena:["SN"] }
  ✅ parseWeatherCode("+TSRA") → { intensity:"HEAVY", descriptor:"TS", phenomena:["RA"] }
  ✅ parseWeatherCode("BR") → { intensity:"MODERATE", descriptor:null, phenomena:["BR"] }
  ✅ resolveDdhh("0106", new Date("2026-01-31T17:00Z")) → 2026-02-01T06:00Z (월 경계)
  ✅ formatCloudBase(1500) → "015"
```

**CP-6: warning-parser + warning-processor**
```
작업:
  - backend/src/parsers/warning-parser.js (XML → 경보 객체)
  - backend/src/processors/warning-processor.js (API 호출 → 파싱 → store.save)

검증 (실제 API 호출):
  ✅ node -e "require('./backend/src/processors/warning-processor').process().then(console.log)"
  ✅ data/warning/latest.json 생성됨
  ✅ JSON 구조 확인:
     - type: "AIRPORT_WARNINGS"
     - fetched_at: ISO 8601
     - airports 객체 존재 (경보 없으면 빈 객체 가능)
     - 경보 있을 경우: wrng_type_key, wrng_type_name, valid_start, valid_end 확인
```

**CP-7: metar-parser + metar-processor**
```
작업:
  - backend/src/parsers/metar-parser.js (IWXXM XML → METAR 객체)
  - backend/src/processors/metar-processor.js (8개 공항 순회 → 통합 JSON)

검증 (실제 API 호출):
  ✅ node -e "require('./backend/src/processors/metar-processor').processAll().then(console.log)"
  ✅ data/metar/latest.json 생성됨
  ✅ 8개 공항 키 존재 확인 (일부 공항은 없을 수 있음)
  ✅ RKSI 데이터 확인:
     - header.icao === "RKSI"
     - observation.wind.direction: 0~360 사이 정수
     - observation.wind.speed: 0 이상 정수
     - observation.visibility.value: 양수
     - observation.weather: 배열
     - observation.clouds: 배열
     - observation.temperature.air: 정수
     - observation.qnh.value: 900~1100 사이
     - display 객체 존재
```

**CP-8: taf-parser + taf-processor**
```
작업:
  - backend/src/parsers/taf-parser.js (가장 복잡 — 반드시 TAF_Hourly_Resolution_Algorithm.md 정독)
    - XML 파싱 (부록 C)
    - 정규화: CAVOK/NSW/NSC 전개 (3절)
    - touched 플래그 (5절)
    - 시간별 분해: BECMG 즉시 적용, TEMPO 오버라이드 (6절)
    - NSW 후처리 (4절)
    - display 생성 (7절)
    - DDhh → DateTime 변환 (8.4절, 기온 시각)
  - backend/src/processors/taf-processor.js (8개 공항 순회 → 통합 JSON)

검증 (실제 API 호출):
  ✅ node -e "require('./backend/src/processors/taf-processor').processAll().then(console.log)"
  ✅ data/taf/latest.json 생성됨
  ✅ RKSI 데이터 확인:
     - header.icao, issued, valid_start, valid_end: ISO 8601
     - header.temperatures.max/min: value(정수) + time(ISO 8601)
     - timeline: 배열, 길이 = (valid_end - valid_start) 시간 수
     - timeline[0].time === valid_start
     - 각 슬롯: wind, visibility, weather, clouds, display 존재
  ✅ BECMG 반영 확인: 시작 시각 이후 슬롯에서 base 값 변경됨
  ✅ TEMPO 반영 확인: 해당 구간 슬롯에서만 오버라이드, 구간 외 원래값
  ✅ touched 확인: wx_touched=false인 BECMG에서 wx 변경 안 됨
```

---

### Phase 3: 통합

**CP-9: index.js (스케줄러 + 실행 락)**
```
작업:
  - backend/src/index.js
    - 초기화: ensureDirectories, initFromFiles
    - cron 등록 (config에서 주기 읽기)
    - runWithLock (타입별 독립 실행 락)

검증:
  ✅ node backend/src/index.js 실행 → "스케줄러 시작" 로그
  ✅ 10분 내에 METAR, 경보 수집 로그 출력
  ✅ 30분 내에 TAF 수집 로그 출력
  ✅ Ctrl+C로 정상 종료
```

---

### Phase 4: 테스트

**CP-10: run-once 테스트 스크립트**
```
작업:
  - backend/test/run-once.js
    - 인자: metar | taf | warning | all
    - 스케줄러 없이 해당 프로세서 1회 실행
    - 결과 요약 출력 (공항 수, 파일 경로 등)

검증:
  ✅ node backend/test/run-once.js all
     → 3종 데이터 수집 완료
     → data/metar/latest.json 존재
     → data/taf/latest.json 존재
     → data/warning/latest.json 존재
  ✅ 2회 연속 실행 → "변경 없음, 스킵" 로그 (canonical hash 동작)
```

**CP-11: 부분 실패/캐시 검증**
```
검증 (수동):
  ✅ .env의 API 키를 틀린 값으로 → 전체 실패 → 이전 데이터 유지
  ✅ 정상 복원 후 재실행 → 정상 수집
  ✅ data/ 안에 latest.json 외 타임스탬프 파일 확인
  ✅ 파일 10개 초과 시 순환 동작 확인
```

---

### Phase 5: 알림 로직 (트리거 + 중복방지 + 설정)

> **참조**: `Alert_System_Design.md` 전체

목표: 트리거 평가, 중복 방지, 설정 병합이 정상 동작하는지 확인.
UI는 console.log + 브라우저 기본 alert() + 간단한 div로만 확인.

**CP-12: shared/alert-defaults.js + 기반**
```
작업:
  - shared/alert-defaults.js 생성 (Alert_System_Design.md 5.2절 기본값)
    - global: alerts_enabled, poll_interval_seconds, cooldown_seconds, quiet_hours
    - dispatchers: popup, sound, marquee 설정
    - triggers: T-01 ~ T-07 기본 파라미터
  - 프론트엔드에 alerts/ 폴더 생성

검증:
  ✅ node -e "console.log(require('./shared/alert-defaults'))" → 설정 출력
  ✅ global, dispatchers, triggers 3개 섹션 존재
```

**CP-13: alert-triggers.js + alert-engine.js (핵심 로직)**
```
작업:
  - frontend/src/alerts/alert-triggers.js: 트리거 정의 (Alert_System_Design.md 3절)
    - T-01: warning_issued (경보 발령, severity: critical)
    - T-02: warning_cleared (경보 해제, severity: info)
    - T-03: low_visibility (저시정, severity: warning/critical)
    - T-04: high_wind (강풍, severity: warning/critical)
    - T-05: weather_phenomenon (기상현상, severity: warning/critical)
    - T-06: low_ceiling (운저고도, severity: warning/critical)
    - T-07: taf_adverse_weather (악기상 예보, severity: warning/critical)
  - frontend/src/alerts/alert-engine.js: 트리거 목록 순회 → evaluate 호출

검증 (실제 data/latest.json으로 테스트):
  ✅ engine.evaluate(metarData, null, settings) 호출
  ✅ 바람 25kt 이상 공항 → high_wind 트리거 발동
  ✅ 경보 존재 시 → warning_issued 트리거 발동
  ✅ 조건 미충족 시 → null 반환
  ✅ console.log로 발동된 트리거 목록 출력
```

**CP-14: alert-state.js (중복 방지)**
```
작업:
  - frontend/src/alerts/alert-state.js
    - alertHistory 관리 (Alert_System_Design.md 6절)
    - 고유 키 생성: "triggerId:icao:고유식별값"
    - 쿨다운 판단 (cooldown_seconds)
    - 조건 해소 시 이력 삭제

검증:
  ✅ 같은 트리거 2회 연속 → 두 번째는 쿨다운으로 무시
  ✅ cooldown_seconds 경과 후 → 재알림
  ✅ 조건 해소 → 이력 삭제 → 다음 발동 시 새 알림
```

**CP-15: alert-dispatcher.js (테스트용 최소 출력)**
```
작업:
  - frontend/src/alerts/alert-dispatcher.js
    - 테스트용: console.log + 브라우저 alert()만 구현
    - severity별 다른 메시지 포맷
    - 설정의 enabled 플래그 반영

검증:
  ✅ critical 트리거 → console에 "[CRITICAL] 경보 발령: 뇌우경보" 출력
  ✅ dispatcher.popup.enabled = false → 팝업 안 뜸
  ✅ 브라우저에서 실제 alert() 팝업으로 트리거 내용 확인
```

**CP-16: alert-settings.js (설정 병합)**
```
작업:
  - frontend/src/alerts/alert-settings.js
    - resolveSettings(): 서버 기본값 + localStorage deepMerge (개인 우선)
    - 간단한 테스트 UI: 임계값 변경 input + 저장 버튼

검증:
  ✅ 기본값으로 동작 확인
  ✅ localStorage에 개인 설정 저장 → 변경된 임계값으로 트리거 평가
  ✅ localStorage 삭제 → 기본값으로 복원
```

**CP-17: 통합 테스트 (폴링 + 트리거 + 중복방지 + 출력)**
```
작업:
  - DataPoller: latest.json을 poll_interval_seconds마다 fetch
  - 이전 데이터 비교 → 변경 시 engine 호출 → state 확인 → dispatch
  - 현재 선택된 공항 기준으로만 트리거 평가

검증:
  ✅ 프론트엔드 실행 상태에서 backend가 새 데이터 저장
  ✅ 폴링이 변경 감지 → 트리거 평가 → console에 알림 출력
  ✅ 동일 조건 유지 시 → 쿨다운 내 재알림 없음
  ✅ 공항 전환 시 → 새 공항 기준으로 트리거 재평가
```

---

### Phase 6: 알림 UI 본 구현

Phase 5의 로직은 그대로 유지하고, dispatcher만 교체한다.

**CP-18: 팝업 알림 컴포넌트**
```
작업:
  - frontend/src/alerts/dispatchers/popup-alert.js
    - 테스트용 alert() → 팝업 컴포넌트로 교체
    - severity별 색상: critical=#FF4444, warning=#FF8800, info=#2196F3
    - 자동 닫힘 (기본 10초, critical은 수동만)
    - 최대 동시 표시 5개 (초과 시 큐잉)
    - 우상단 표시 (위치 설정 가능)

검증:
  ✅ critical 알림 → 빨간 팝업, 수동 닫기만
  ✅ warning 알림 → 주황 팝업, 10초 후 자동 닫힘
  ✅ 6개 동시 발동 → 5개 표시 + 1개 큐잉
```

**CP-19: 소리 알림**
```
작업:
  - frontend/src/alerts/dispatchers/sound-alert.js
    - 오디오 파일: alert-critical.mp3, alert-warning.mp3, alert-info.mp3
    - Web Audio API 재생
    - 볼륨 설정 (기본 70%)
    - 반복 횟수: critical=3회, warning/info=1회

검증:
  ✅ critical → 긴급 알람 3회 반복
  ✅ warning → 경고음 1회
  ✅ 볼륨 변경 반영
  ✅ sound.enabled = false → 소리 안 남
```

**CP-20: 마퀴 알림**
```
작업:
  - frontend/src/alerts/dispatchers/marquee-alert.js
    - 화면 상단 가로 스크롤 문구 (뉴스 티커 방식)
    - severity 필터 (기본: warning 이상만)
    - 배경색: severity별
    - 속도, 표시 시간 설정 가능
    - 여러 알림 큐잉 → 순차 스크롤

검증:
  ✅ warning 이상 트리거 → 상단에 스크롤 문구 표시
  ✅ info 트리거 → 마퀴 미표시 (min_severity 필터)
  ✅ 복수 알림 → 순차 스크롤
```

**CP-21: 설정 UI**
```
작업:
  - 알림 설정 화면 구현 (Alert_System_Design.md 10절 레이아웃)
    - 전역: 알림 사용, 야간 모드, 재알림 간격
    - 알림 방식: 팝업/소리/마퀴 개별 on/off + 세부 설정
    - 감시 조건: T-01~T-07 개별 on/off + 파라미터 조정
    - 기본값 복원 버튼
  - localStorage 저장/불러오기

검증:
  ✅ 설정 변경 → localStorage 저장 → 즉시 반영 (핫 리로드)
  ✅ 기본값 복원 → 모든 설정 초기화
  ✅ 페이지 새로고침 → 개인 설정 유지
```

---

### 체크포인트 요약

| CP | Phase | 작업 | 핵심 검증 |
|----|-------|------|----------|
| 1 | 1 | 프로젝트 초기화 | npm install 성공 |
| 2 | 1 | shared 상수 | require로 import 성공 |
| 3 | 1 | config + api-client | API 1회 호출 → XML 반환 |
| 4 | 1 | store | save/해시비교/순환 동작 |
| 5 | 2 | parse-utils | 단위 테스트 통과 |
| 6 | 2 | warning 파서+프로세서 | 경보 JSON 생성 |
| 7 | 2 | metar 파서+프로세서 | METAR JSON 생성 (8개 공항) |
| 8 | 2 | taf 파서+프로세서 | TAF timeline JSON 생성 |
| 9 | 3 | index.js 스케줄러 | cron 동작 확인 |
| 10 | 4 | run-once 테스트 | all 실행 성공 |
| 11 | 4 | 부분 실패/캐시 | 복구 + 순환 동작 |
| 12 | 5 | alert-defaults 상수 | 설정 구조 출력 |
| 13 | 5 | 트리거 + 엔진 | 트리거 발동/미발동 확인 |
| 14 | 5 | 중복 방지 (state) | 쿨다운 + 이력 삭제 |
| 15 | 5 | dispatcher (테스트용) | console.log 출력 |
| 16 | 5 | 설정 병합 | localStorage 우선 병합 |
| 17 | 5 | 통합 테스트 | 폴링→트리거→출력 전체 흐름 |
| 18 | 6 | 팝업 알림 UI | severity별 색상/닫힘 |
| 19 | 6 | 소리 알림 | 재생/볼륨/반복 |
| 20 | 6 | 마퀴 알림 | 스크롤 문구/큐잉 |
| 21 | 6 | 설정 UI | 설정 화면 + 저장/복원 |

---

## 9. 검증 체크리스트

### 파싱 정확성

| # | 테스트 | 확인 |
|---|-------|------|
| 1 | METAR wind (VRB, 정온, 돌풍) | direction, speed, gust 값 |
| 2 | METAR visibility (CAVOK 포함) | value, cavok 플래그 |
| 3 | METAR weather (복수, 없음) | 배열 길이, raw 값 |
| 4 | METAR clouds (복수, NSC) | amount, base 값 |
| 5 | METAR temperature/dewpoint | 양수, 음수, 0 |
| 6 | METAR QNH | 값, 단위 |
| 7 | TAF base forecast 파싱 | 모든 필드 |
| 8 | TAF BECMG 적용 | 시작 시각부터 base 변경 |
| 9 | TAF TEMPO 적용 | 해당 구간만 오버라이드 |
| 10 | TAF touched 플래그 | wx_touched=false면 wx 변경 안 함 |
| 11 | TAF timeline 시간 수 | valid_end - valid_start 시간 수 일치 |
| 12 | TAF 기온 시각 (DDhh → ISO) | 월 경계 정상 변환 |
| 13 | 경보 유형 매핑 | wrng_type → key/name 정확 |
| 14 | 경보 공항별 그룹핑 | airports 키에 올바른 ICAO |

### 스케줄러/캐시

| # | 테스트 | 확인 |
|---|-------|------|
| 15 | 최초 실행 | latest.json + 타임스탬프 파일 생성 |
| 16 | 동일 데이터 재실행 | 파일 생성 안 함 |
| 17 | fetched_at만 다름 | 파일 생성 안 함 (canonical hash) |
| 18 | 1개 공항 실패 | 이전 데이터 복구, _stale 표시 |
| 19 | latest.json 순환 제외 | 삭제 안 됨 |
| 20 | 파일 11개 시 순환 | 가장 오래된 1개 삭제 |

### 알림 시스템

| # | 테스트 | 확인 |
|---|-------|------|
| 21 | 트리거 발동 (조건 충족) | evaluate → 결과 객체 반환 |
| 22 | 트리거 미발동 (조건 미충족) | evaluate → null 반환 |
| 23 | severity 자동 승격 | 시정 < 500m → critical, TS → critical |
| 24 | 쿨다운 내 중복 방지 | 동일 키 재발동 → 무시 |
| 25 | 쿨다운 경과 후 재알림 | cooldown_seconds 후 → 재알림 |
| 26 | 조건 해소 시 이력 삭제 | 시정 회복 → alertHistory에서 삭제 |
| 27 | 설정 병합 (기본값 + 개인) | localStorage 우선 적용 |
| 28 | 트리거 enabled=false | 해당 트리거 평가 스킵 |
| 29 | quiet_hours 내 알림 억제 | 야간 모드 시 알림 안 함 |
| 30 | 공항 전환 시 재평가 | 선택 공항 변경 → 새 공항 기준 트리거 |

---

## 10. 주의사항

1. **네트워크**: apihub.kma.go.kr 방화벽/프록시 확인
2. **XML 인코딩**: KMA 응답이 EUC-KR일 수 있음. UTF-8 아니면 변환 필요
3. **빈 응답**: 소규모 공항은 TAF/METAR 없을 수 있음. items 비어있으면 graceful 처리
4. **IWXXM 버전**: `http://icao.int/iwxxm/2023-1` 기준
5. **taf-parser.js가 가장 복잡**: `TAF_Hourly_Resolution_Algorithm.md`의 2절(모델), 3절(정규화), 5절(partial_merge + touched), 6절(메인 알고리즘), 부록 C(XML 매핑) 반드시 정독
6. **알림 시스템**: `Alert_System_Design.md` 참조. 트리거는 플러그인 방식(배열 추가/제거), 알림 형태는 독립적(popup/sound/marquee 개별 on/off)
7. **브라우저 오디오**: Web Audio API는 사용자 최초 상호작용 후에만 활성화됨. 자동 재생 차단 대응 필요
8. **설정 2계층**: shared/alert-defaults.js(서버 기본값) + localStorage(개인 설정). 개인 설정이 우선, deepMerge로 병합

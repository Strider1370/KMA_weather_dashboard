# Backend Collectors

Status: Current as of 2026-05-02.

이 문서는 현재 백엔드 수집기와 저장 산출물을 요약합니다. 레이더/위성/낙뢰/ADS-B의 재구현용 상세 로직은 `weather-overlay-data-implementation.md`, SIGMET/AIRMET/SIGWX_LOW 상세 로직은 `advisory-overlays-implementation.md`를 우선합니다.

## 사이트에서 하는 일

백엔드 수집기는 사이트에 표시되는 모든 실시간/준실시간 기상 데이터의 공급원이다. METAR/TAF/공항경보는 카드와 예보 타임라인에 쓰이고, 레이더/위성/낙뢰/SIGWX/SIGMET/AIRMET/ADS-B는 지도 오버레이에 쓰인다. `/ground` 화면의 주간예보, 현재 날씨 카드, 미세먼지/UV 정보도 이 수집기들이 만든 데이터를 사용한다.

수집기는 단순히 API 응답을 저장하는 역할만 하지 않는다. 일부 데이터는 파싱, 시간축 보정, 공항별 분류, 지도용 PNG 렌더링, 이전 데이터 보존, 변경 감지용 hash 생성까지 수행한다. 따라서 다른 프로젝트에 같은 기능을 옮길 때는 API 호출뿐 아니라 이 저장/가공 규칙까지 함께 구현해야 한다.

## Collector Runtime

Collectors live under `backend/src/processors/` and are scheduled from `backend/src/index.js`.

- Scheduler entry: `backend/src/index.js`
- Config source: `backend/src/config.js`
- Persistence/cache: `backend/src/store.js`
- Shared retry client for main KMA IWXXM feeds: `backend/src/api-client.js`
- One-off verification runner: `backend/test/run-once.js`

Every scheduled job is wrapped by `runWithLock(type, job)`, so a slow run of the same type is skipped instead of overlapping.

## Scheduled Collectors

| Type | Processor | Parser / Renderer | Schedule | Main output |
|---|---|---|---|---|
| `metar` | `metar-processor.js` | `metar-parser.js` | `*/10 * * * *` | `backend/data/metar/latest.json` |
| `taf` | `taf-processor.js` | `taf-parser.js` | `*/30 * * * *` | `backend/data/taf/latest.json` |
| `warning` | `warning-processor.js` | `warning-parser.js` | `*/5 * * * *` | `backend/data/warning/latest.json` |
| `sigmet` | `sigmet-processor.js` | `sigmet-parser.js`, `iwxxm-advisory-parser.js` | `*/5 * * * *` | `backend/data/sigmet/latest.json` |
| `airmet` | `airmet-processor.js` | `airmet-parser.js`, `iwxxm-advisory-parser.js` | `*/5 * * * *` | `backend/data/airmet/latest.json` |
| `sigwx_low` | `sigwx-low-processor.js` | `sigwx-low-parser.js`, `sigwx-front-overlay.js`, `sigwx-cloud-overlay.js` | `5 5,11,17,23 * * *` | `backend/data/sigwx_low/latest.json`, front/cloud overlay PNG/meta |
| `amos` | `amos-processor.js` | `amos-parser.js` | `*/10 * * * *` | `backend/data/amos/latest.json` |
| `lightning` | `lightning-processor.js` | `lightning-parser.js` | `*/5 * * * *` | `backend/data/lightning/latest.json` |
| `radar_echo` | `radar-echo-processor.js` | `radar-echo-parser.js` | `*/5 * * * *` | `backend/data/radar/echo_meta.json`, `echo_korea_<tm>.png` |
| `satellite` | `satellite-processor.js` | `satellite-parser.js` | `*/10 * * * *` | `backend/data/satellite/sat_meta.json`, `sat_korea_<tm>.png` |
| `adsb` | `adsb-processor.js` | processor-local normalization | `*/5 * * * *` | `backend/data/adsb/latest.json` |
| `ground_forecast` | `ground-forecast-processor.js` | processor-local composition | `30 6,11,18,23 * * *` | `backend/data/ground_forecast/latest.json`, `ground_overview/latest.json` |
| `environment` | `environment-processor.js` | processor-local normalization | `10 * * * *` | `backend/data/environment/latest.json` |

## Data Storage Rules

`backend/src/store.js` writes most JSON datasets with the same pattern:

- `backend/data/<type>/latest.json` is always the latest payload.
- Changed payloads also get historical JSON files.
- `content_hash` is computed from canonicalized content and is used by `/api/snapshot-meta`.
- Unchanged payloads do not create a new history file, but `latest.json` gets a refreshed `fetched_at`.
- Runtime data under `backend/data/` is generated output and should not be committed unless explicitly requested.

Radar and satellite image frames are stored as PNG plus metadata under their own data folders. SIGWX_LOW additionally stores `fronts_<tmfc>.png`, `fronts_meta_<tmfc>.json`, `clouds_<tmfc>.png`, and `clouds_meta_<tmfc>.json`.

## Collection Stats

`backend/src/stats.js` is initialized by `backend/src/index.js` and receives `recordSuccess(type, result)` / `recordFailure(type, error)` calls from `runWithLock()`.

- Stats are persisted under `backend/data/stats/latest.json`.
- The tracked types are defined inside `backend/src/stats.js`.
- This is scheduler/runtime telemetry, not a public dashboard API in the current server surface.
- `frontend/src/components/StatsPanel.jsx` still exists, but current `frontend/src/App.jsx` does not import or render it.

## Important Collector Notes

### METAR / TAF / WARNING

These use KMA aviation APIs through the common config and parser layer. METAR and TAF process all configured real ICAO airports from `shared/airports`; mock-only airports are excluded in backend config.

### SIGMET / AIRMET

Both share `backend/src/parsers/iwxxm-advisory-parser.js` and are served separately through `/api/sigmet` and `/api/airmet`. Frontend filtering and display rules belong in `docs/alerts-and-settings.md` and `docs/map-overlays.md`.

### SIGWX_LOW

SIGWX_LOW is collected from the KMA `amo_sigwx.php` feed. The processor probes the latest available cycle, saves the parsed JSON, and precomputes front/cloud overlays for map rendering. Front and CB cloud overlays are `tmfc`-aware, so the frontend can request metadata for the currently selected history frame.

### AMOS

AMOS stores daily rainfall separately from METAR. The frontend reads the AMOS dataset for `일강수량` instead of embedding rainfall in METAR hashes.

### Lightning

Lightning collection uses a nationwide fetch and maintains a rolling strike history. Airport mode still derives 8/16/32 km zone counters from the selected airport.

### Radar Echo

Radar echo uses the configured radar composite type, currently `hsr`, converts radar values for the in-app rain-rate legend, and renders full-domain overlay PNG frames.

### Satellite

Satellite collection uses GK2A LE1B IR imagery plus LE2 FOG output. The current default is `IR105`, `FOG`, and region `KO`. NetCDF/HDF5 files are parsed and rendered to web-consumable PNG frames.

### ADS-B

ADS-B uses OpenSky `states/all`, first bounded by configured lat/lon limits and then filtered against the Incheon FIR polygon when the FIR file is available.

### Ground Forecast / Environment

`ground_forecast` combines KMA short/mid-term land and temperature forecasts into the `/ground` 7-day panel. `environment` collects PM and UV data for the ground current-weather card.

## Verification Commands

```bash
npm test
node backend/test/run-once.js metar
node backend/test/run-once.js taf
node backend/test/run-once.js warning
node backend/test/run-once.js sigmet
node backend/test/run-once.js airmet
node backend/test/run-once.js sigwx-low
node backend/test/run-once.js lightning
node backend/test/run-once.js radar-echo
node backend/test/run-once.js satellite
node backend/test/run-once.js adsb
node backend/test/run-once.js ground-forecast
```

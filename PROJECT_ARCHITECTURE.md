<!-- NOTE: This document is encoded in UTF-8. Open/read/write using UTF-8 to avoid mojibake. -->

# KMA Aviation Weather Dashboard - 프로젝트 아키텍처

> KMA API 기반 항공기상 대시보드. METAR/TAF/WARNING/LIGHTNING/RADAR 수집, 캐시 저장, React UI 표출, 트리거 기반 알림 제공.

## 1. 프로젝트 개요

### AI 최초 확인 파일 순서
1. `backend/src/index.js`
2. `backend/src/config.js`
3. `backend/src/store.js`
4. `frontend/server.js`
5. `frontend/src/App.jsx`

### 핵심 기능
- 데이터 수집: METAR, TAF, WARNING, LIGHTNING, RADAR
- 대시보드 표출: 공항별 현재/예보/경보 + 낙뢰 지도 + 레이더 패널
- 알림 시스템: 8개 트리거, 팝업/사운드/마퀴 디스패처
- 캐시/이력 관리: `latest.json` + 타입별 히스토리 파일 회전
- 테스트 공항 오버레이: `TST1` 샘플 JSON 병합

### 수집 주기 (cron)
- METAR: `*/10 * * * *`
- TAF: `*/30 * * * *`
- WARNING: `*/5 * * * *`
- LIGHTNING: `*/3 * * * *`
- RADAR: `*/5 * * * *`

## 2. 기술 스택

### Backend
- Node.js (CommonJS)
- `node-cron`
- `fast-xml-parser`
- `dotenv`

### Frontend
- React 18
- Vite 6
- Vanilla CSS

### Dev
- `concurrently`
- `@turf/union` ^7.3.4 (GeoJSON 시군구 dissolve 빌드 스크립트 전용)

## 3. 디렉토리 구조 (현재 코드 기준)

```text
KMA_weather_dashboard/
├── backend/
│   ├── src/
│   │   ├── api-client.js
│   │   ├── config.js
│   │   ├── index.js
│   │   ├── store.js
│   │   ├── parsers/
│   │   │   ├── parse-utils.js
│   │   │   ├── metar-parser.js
│   │   │   ├── taf-parser.js
│   │   │   ├── warning-parser.js
│   │   │   └── lightning-parser.js
│   │   └── processors/
│   │       ├── metar-processor.js
│   │       ├── taf-processor.js
│   │       ├── warning-processor.js
│   │       ├── lightning-processor.js
│   │       └── radar-processor.js
│   ├── test/
│   │   ├── run-once.js
│   │   └── sliceGeoJSON.js  (빌드 전 1회: map.geojson → geo/*.geojson)
│   └── data/
│       ├── metar/      (latest.json, METAR_*.json)
│       ├── taf/        (latest.json, TAF_*.json)
│       ├── warning/    (latest.json, WARNINGS_*.json)
│       ├── lightning/  (latest.json, LIGHTNING_*.json)
│       ├── radar/      (latest.json, RDR_*.png)
│       └── TST1/       (metar.json, taf.json, warning.json, lightning.json)
├── frontend/
│   ├── public/
│   │   └── geo/
│   │       ├── RKSI_admdong.geojson   (행정동 슬라이스, 빌드 스크립트 생성)
│   │       ├── RKSI_sigungu.geojson   (시군구 dissolved, 빌드 스크립트 생성)
│   │       └── ... (공항별 각 2개, 총 16개)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Controls.jsx
│   │   │   ├── SummaryGrid.jsx
│   │   │   ├── StatusPanel.jsx
│   │   │   ├── MetarCard.jsx
│   │   │   ├── WarningList.jsx
│   │   │   ├── TafTimeline.jsx
│   │   │   ├── LightningMap.jsx
│   │   │   ├── RadarPanel.jsx
│   │   │   └── alerts/
│   │   │       ├── AlertPopup.jsx
│   │   │       ├── AlertSound.jsx
│   │   │       ├── AlertMarquee.jsx
│   │   │       └── AlertSettings.jsx
│   │   └── utils/
│   │       ├── api.js
│   │       ├── helpers.js
│   │       ├── geoToSVG.js            (GeoJSON → SVG path 변환)
│   │       └── alerts/
│   │           ├── index.js
│   │           ├── alert-triggers.js
│   │           ├── alert-engine.js
│   │           ├── alert-state.js
│   │           ├── alert-dispatcher.js
│   │           └── alert-settings.js
│   ├── server.js                (운영 API + 정적서빙 + 스케줄러 시작)
│   ├── vite.config.js
│   ├── index.html
│   ├── legacy/
│   └── dist/
├── shared/
│   ├── airports.js              (runway_hdg 필드 포함)
│   ├── warning-types.js
│   ├── alert-defaults.js
│   └── weather-icons.js
├── docs/
│   ├── METAR_Parsing_Algorithm.md
│   ├── TAF_Hourly_Resolution_Algorithm.md
│   ├── Warning_Parsing_Algorithm.md
│   ├── Scheduler_Cache_Design.md
│   ├── Alert_System_Design.md
│   ├── Lightning_Data_Design.md
│   ├── radar_image_design_v_2_overlay_div.md
│   ├── Weather_Visualization_Mapping.md
│   └── map.md                   (낙뢰 맵 행정동/시군구 경계 구현 문서)
├── map.geojson                  (전국 행정동 원본 33MB, git 제외)
├── .env
├── .env.example
├── .editorconfig
├── package.json
└── PROJECT_ARCHITECTURE.md
```

## 4. 데이터 플로우

### 수집/저장
```text
KMA API (XML/텍스트/이미지)
  -> processors/*
  -> parsers/* (해당 타입)
  -> store.save(...) 또는 radar 파일 저장
  -> backend/data/<type>/latest.json (+ history)
```

### API/표출
```text
frontend/src/utils/api.js
  -> frontend/server.js (/api/*)
  -> backend/data/*/latest.json read
  -> App.jsx state 반영
  -> 컴포넌트 렌더링
```

### TST1 오버레이
```text
server.js
  mergeTst1(payload, category)
  -> backend/data/TST1/<category>.json
  -> payload.airports.TST1 병합
```

## 5. 핵심 컴포넌트

### backend/src/index.js
- 스케줄 등록 및 실행 lock 관리 (`runWithLock`)
- `metar/taf/warning/lightning/radar` 주기 작업 실행

### backend/src/config.js
- `.env` 로드
- 공항 목록 필터링: `mock_only` 제외 + ICAO 4자리만 수집
- API URL, schedule, storage 경로, radar/lightning 설정 제공

### backend/src/api-client.js
- METAR/TAF/WARNING URL 생성 및 재시도 fetch
- API 헤더(`resultCode/resultMsg`) 유효성 검사

### backend/src/parsers/metar-parser.js
- `iwxxm:METAR`/`iwxxm:SPECI` 루트 정규화
- 헤더에 `report_type`(`METAR`/`SPECI`) 추출하여 저장

### backend/src/store.js
- 타입: `metar`, `taf`, `warning`, `lightning`
- canonical hash 기반 중복 저장 방지
- `latest.json` 갱신, 파일 회전(max 10)
- 실패 공항 이전값 `_stale` 병합 지원

### frontend/server.js
- `/api/metar|taf|warning|lightning|radar|status|airports|warning-types|alert-defaults`
- `/api/refresh` (5개 프로세서 `Promise.allSettled` 실행)
- `/data/*` 정적 파일 서빙 (레이더 PNG 포함)
- 서버 시작 시 backend scheduler 자동 기동

### frontend/src/App.jsx
- 전체 데이터 로딩 및 공항 선택 상태 관리
- 알림 평가/디스패치/쿨다운 처리
- 좌측(METAR/TAF/WARNING) + 우측(Lightning/Radar) 레이아웃
- `boundaryLevel` state: AlertSettings 저장 후 localStorage `lightning_boundary` 읽어 갱신. `LightningMap`에 prop 전달.
- `windDir`: `data.metar.airports[icao].observation.wind` 에서 추출. CALM(`w.calm`) 또는 VRB(`w.variable`) 시 null 전달 → LightningMap 기본 runway_hdg 사용.

### shared/airports.js
- 실제 공항 8개 + TST1(mock) 정의
- `runway_hdg` 필드: 각 공항 대표 활주로 자기방위각(°). LightningMap ✈ 회전에 사용.
- `mock_only: true` 플래그로 수집 대상에서 TST1 제외.

### backend/test/sliceGeoJSON.js (빌드 스크립트)
- 1회 실행용 Node.js 스크립트. `npm run dev` 또는 운영 서버와 무관.
- `shared/airports.js`에서 실제 공항 목록 로드 (mock_only 제외).
- `map.geojson`(33MB)을 각 공항 ARP 기준 **48km bbox**(RANGE_KM 32 × PADDING 1.5)로 필터링.
- `_admdong.geojson`: bbox 내 행정동 feature 원본 저장.
- `_sigungu.geojson`: `properties.sgg`(5자리 시군구 코드) 기준 `@turf/union` v7 dissolve 후 저장.
- 출력 경로: `frontend/public/geo/` (Vite dev `/geo/`, 빌드 시 `dist/geo/` 복사).
- 실행: 루트 디렉토리에서 `node backend/test/sliceGeoJSON.js`

### frontend/src/utils/helpers.js
- `toCanvasXY(point, arp, size, rangeKm)`: ARP 기준 등장방형(equirectangular) 투영으로 위경도 → SVG 픽셀 변환. LightningMap과 geoToSVG 양쪽에서 공유.

### frontend/src/utils/geoToSVG.js
- `geoToSVGPaths(geojson, arp, size, rangeKm)`: GeoJSON FeatureCollection을 SVG `<path d>` 문자열 배열로 변환. Polygon/MultiPolygon 지원.

### frontend/src/components/MetarCard.jsx
- **v1 (텍스트)**: 기존의 검정색 로그 배경 상세 텍스트 표출.
- **v2 (사이드바)**: 아이콘, 풍향 화살표, 수치 그리드 기반의 요약 시각화.
- 공통: 280px 고정 높이 적용으로 레이아웃 안정성 확보.

### frontend/src/components/TafTimeline.jsx
- **v1 (테이블)**: 12시간 단위 상세 데이터 표.
- **v2 (타임라인)**: 연속 데이터 그룹화(`groupElementsByValue`) 기반의 색상 바 시각화. 날짜 변경선 표시.
- **v3 (그리드)**: 시간대별 카드 형태 나열. 항목 레이블 왼쪽 고정.
- 공통: 풍향 화살표(+180도 보정) 및 Gust(돌풍) 정보 포함.

### frontend/src/components/LightningMap.jsx
- Props: `lightningData`, `selectedAirport`, `airports`, `boundaryLevel = 'sigungu'`, `windDir = null`
- 공항 전환 또는 `boundaryLevel` 변경 시 `/geo/{ICAO}_{boundaryLevel}.geojson` fetch.
- SVG 레이어 순서: 배경(#131a24) → clipPath(rect rx=14) → 행정동/시군구 경계(fill=#1e2d3d, stroke=#00cc66) → 존 원(8/16/32km) → ✈ 아이콘 → 낙뢰 마커.
- `pickRunwayDirection(runwayHdg, windDir)`: runway_hdg의 양방향(hdg, hdg+180°) 중 windDir에 더 가까운 쪽 선택 (맞바람 이륙 원칙).
- ✈ 이모지는 `rotate(effectiveHdg - 90, center, center)` 적용. CALM/VRB 시 기본 runway_hdg 사용.
- clipPath가 정사각형(rect rx=14)이므로 패널 전체에 지도 표시 (32km 원 바깥 모서리까지 포함).

### frontend/src/components/alerts/AlertSettings.jsx
- 디스플레이 설정 섹션: METAR 표시 모드(v1/v2), TAF 표시 모드(v1/v2/v3), **낙뢰 지도 경계(시군구/행정동)** 선택.
- 저장 시 localStorage `lightning_boundary` 키 쓰기; 초기화 시 삭제.
- `metar_version` / `taf_version`과 동일한 localStorage 패턴.

### frontend/src/utils/visual-mapper.js
- 데이터 기반 아이콘 키 산출 및 임계값(Threshold)에 따른 색상 매핑 로직 통합.
- 영하 온도 표시 정규화 (M -> -).

## 6. 파일 의존성 맵

### 백엔드 런타임 의존성
... (생략) ...

### 서버/프론트 의존성

```text
frontend/src/App.jsx
├─ ./utils/visual-mapper (신규: 시각화 로직)
├─ ./components/WeatherIcon (신규: 아이콘 렌더러)
└─ ./components/* (v1/v2/v3 멀티 버전 지원)
```

## 7. 레이아웃 구조 (Tiered Layout)

대시보드는 요소 간 간섭을 최소화하기 위해 층(Tier) 구조를 채택함:
- **1층 (Top Row)**: METAR 카드와 공항경보가 가로로 나란히 배치 (높이 동기화).
- **2층 (Bottom Row)**: TAF 예보가 가로 전체 너비 사용.
- **우측 컬럼**: 낙뢰 지도와 레이더 패널 수직 배치.

```text
backend/src/index.js
├─ node-cron
├─ ./config
├─ ./store
└─ ./processors/{metar,taf,warning,lightning,radar}-processor

backend/src/processors/metar-processor.js
├─ ../config
├─ ../api-client
├─ ../parsers/metar-parser
└─ ../store

backend/src/processors/taf-processor.js
├─ ../config
├─ ../api-client
├─ ../parsers/taf-parser
└─ ../store

backend/src/processors/warning-processor.js
├─ ../api-client
├─ ../parsers/warning-parser
└─ ../store

backend/src/processors/lightning-processor.js
├─ path
├─ ../config
├─ ../parsers/lightning-parser
└─ ../store

### backend/src/processors/radar-processor.js
- 현재 시점(`delay_minutes` 반영)부터 과거로 36개(`max_images`)의 타임스탬프 목록 생성
- 로컬에 존재하지 않는 이미지만 선별적으로 다운로드하여 데이터 공백 자동 메움
- 목록에 없는 오래된 파일 자동 삭제 및 `latest.json` 갱신
- API 과부하 방지를 위해 대량 다운로드 시 짧은 지연시간(`sleep`) 적용

backend/src/api-client.js
└─ ./config

backend/src/parsers/{metar,taf,warning,lightning}-parser.js
└─ fast-xml-parser (+ parse-utils 공통 유틸)

backend/src/store.js
├─ crypto
├─ fs
├─ path
└─ ./config
```

### 서버/프론트 의존성

```text
frontend/server.js
├─ fs, path, http
├─ ../backend/src/index
├─ ../backend/src/processors/*
├─ ../backend/data/*
└─ ../shared/{airports,warning-types,alert-defaults}

frontend/src/App.jsx
├─ react
├─ ./utils/api
├─ ./utils/alerts/index
└─ ./components/* (+ components/alerts/*)

frontend/src/utils/api.js
└─ /api/* endpoint 호출

frontend/src/utils/alerts/index.js
├─ ./alert-engine
├─ ./alert-state
├─ ./alert-dispatcher
└─ ./alert-settings

frontend/src/utils/alerts/alert-engine.js
└─ ./alert-triggers
```

### 패키지 의존성

#### 루트 `package.json`
- dependencies: `dotenv`, `fast-xml-parser`, `node-cron`
- devDependencies: `concurrently`, `@turf/union` ^7.3.4

#### `frontend/package.json`
- dependencies: `react`, `react-dom`
- devDependencies: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`

## 7. API 엔드포인트

- `GET /api/metar` -> `backend/data/metar/latest.json` (+ TST1 merge)
- `GET /api/taf` -> `backend/data/taf/latest.json` (+ TST1 merge)
- `GET /api/warning` -> `backend/data/warning/latest.json` (+ TST1 merge)
- `GET /api/lightning` -> `backend/data/lightning/latest.json` (+ TST1 merge)
- `GET /api/radar` -> `backend/data/radar/latest.json`
- `GET /api/status` -> 타입별 존재/최신시각/개수
- `GET /api/airports` -> `shared/airports.js`
- `GET /api/warning-types` -> `shared/warning-types.js`
- `GET /api/alert-defaults` -> `shared/alert-defaults.js`
- `POST /api/refresh` -> 5개 수집 프로세서 수동 실행 결과
- `GET /data/*` -> `backend/data` 정적 파일

## 8. 알림 시스템

### 트리거 (8개)
1. `warning_issued`
2. `warning_cleared`
3. `low_visibility`
4. `high_wind`
5. `weather_phenomenon`
6. `low_ceiling`
7. `taf_adverse_weather`
8. `lightning_detected`

### 설정 소스
- 서버 기본값: `shared/alert-defaults.js`
- 사용자 오버라이드: browser `localStorage`
- 기본 폴링 값: `poll_interval_seconds = 300`

## 9. 환경 변수

- `API_AUTH_KEY` (필수): KMA API 인증키 (METAR/TAF/WARNING/LIGHTNING/RADAR 공용)
- `API_BASE_URL` (선택): 기본 typ02 API base URL
- `LIGHTNING_API_URL` (선택): 낙뢰 API URL
- `RADAR_API_URL` (선택): 레이더 API URL
- `DATA_PATH` (선택): 데이터 저장 경로 (미설정 시 `backend/data`)
- `PORT` (선택): 대시보드 서버 포트 (기본 5173)

### 변경 금지/주의
- 서버 진입점은 `frontend/server.js` 단일 파일 기준으로 유지.
- `TST1` 데이터는 `backend/data/TST1/*.json` 오버레이 전용이며 수집 대상 공항과 분리 운용.
- 인증키는 `API_AUTH_KEY` 단일 키만 사용 (`KMA_AUTH_KEY`, `radar_auth_key` 미사용).

## 10. 실행 방법

```bash
# 루트 디렉토리에서 실행

# 의존성 설치
npm install
npm --prefix frontend install

# 개발 (API+Scheduler + Vite)
npm run dev

# 운영 서버 (dist 서빙 + API + Scheduler)
npm run dashboard

# 스케줄러만
npm start

# 수동 1회 수집
npm test
node backend/test/run-once.js metar
node backend/test/run-once.js taf
node backend/test/run-once.js warning
node backend/test/run-once.js lightning
node backend/test/run-once.js radar
```

## 11. 설계 문서 링크

- `docs/METAR_Parsing_Algorithm.md`
- `docs/TAF_Hourly_Resolution_Algorithm.md`
- `docs/Warning_Parsing_Algorithm.md`
- `docs/Scheduler_Cache_Design.md`
- `docs/Alert_System_Design.md`
- `docs/Lightning_Data_Design.md`
- `docs/radar_image_design_v_2_overlay_div.md`
- `docs/Weather_Visualization_Mapping.md`
- `docs/map.md` — 낙뢰 맵 행정동/시군구 경계 표시 구현 (sliceGeoJSON, geoToSVG, LightningMap 오버레이)

---

최종 업데이트: 2026-02-19




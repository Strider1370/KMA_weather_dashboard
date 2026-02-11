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

## 3. 디렉토리 구조 (현재 코드 기준)

```text
project/
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
│   │   └── run-once.js
│   └── data/
│       ├── metar/      (latest.json, METAR_*.json)
│       ├── taf/        (latest.json, TAF_*.json)
│       ├── warning/    (latest.json, WARNINGS_*.json)
│       ├── lightning/  (latest.json, LIGHTNING_*.json)
│       ├── radar/      (latest.json, RDR_*.png)
│       └── TST1/       (metar.json, taf.json, warning.json, lightning.json)
├── frontend/
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
│   ├── airports.js
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
│   └── Weather_Visualization_Mapping.md
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

## 6. 파일 의존성 맵

### 백엔드 런타임 의존성

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

backend/src/processors/radar-processor.js
├─ fs
├─ path
└─ ../config

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
- devDependencies: `concurrently`

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

---

최종 업데이트: 2026-02-11


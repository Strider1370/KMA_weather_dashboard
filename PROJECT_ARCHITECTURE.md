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
│   │   ├── sliceGeoJSON.js       (빌드 전 1회: map.geojson → geo/*.geojson)
│   │   ├── generate-full-radar.js (이진 자료 → 전체 그리드 고해상도 PNG 변환)
│   │   └── generate-radar-tile.js (이진 자료 → 공항별 480px 오버레이 타일 생성)
│   └── data/
│       ├── metar/      (latest.json, METAR_*.json)
│       ├── taf/        (latest.json, TAF_*.json)
│       ├── warning/    (latest.json, WARNINGS_*.json)
│       ├── lightning/  (latest.json, LIGHTNING_*.json)
│       ├── radar/      (latest.json, RDR_*.png)
│       ├── radar-tiles/ (공항별 레이더 오버레이 PNG 타일)
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
│   │   │       └── Settings.jsx
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
│   ├── radar_binary_lightning_overlay_design.md (이진 레이더 타일 생성 설계)
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
  -> store.getCached(type) 인메모리 캐시 조회
       hit  -> 즉시 res.json()
       miss -> backend/data/*/latest.json read (cold start 폴백, 1회)
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

### backend/test/generate-radar-tile.js & generate-full-radar.js
- **generate-full-radar.js**: KMA 레이더 이진 자료(`.bin.gz`)를 읽어 전체 그리드(2305x2881) 고해상도 PNG를 생성.
- **generate-radar-tile.js**: 이진 자료를 기반으로 공항별 480x480 PNG 타일을 생성하여 `LightningMap` 오버레이용으로 제공.
- **공통 특징**: Marshall-Palmer 관계식을 이용한 강우강도(mm/h) 변환, 24단계 공식 색상 범례 적용, 쌍선형 보간(Bilinear Interpolation)을 통한 부드러운 렌더링 지원.

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

### backend/src/parsers/taf-parser.js
- `iwxxm:reportStatus` → `header.report_status` 필드 추출 (`'AMENDMENT'` 또는 `null`). 프론트엔드 AMD 표시에 활용.

### backend/src/store.js
- 타입: `metar`, `taf`, `warning`, `lightning`
- canonical hash 기반 중복 저장 방지
- `latest.json` 갱신, 파일 회전(max 10)
- 실패 공항 이전값 `_stale` 병합 지원
- `getCached(type)`: `cache[type].prev_data`를 반환하는 API 서빙용 게터 (스케줄러가 같은 프로세스에서 실행되므로 공유 메모리 직접 참조)

### frontend/server.js
- `/api/metar|taf|warning|lightning|radar|status|airports|warning-types|alert-defaults`
- `/api/refresh` (5개 프로세서 `Promise.allSettled` 실행)
- `/data/*` 정적 파일 서빙 (레이더 PNG 포함)
- 서버 시작 시 backend scheduler 자동 기동
- `readLatest(category)` / `readLightning()`: `store.getCached(type)` 인메모리 캐시 우선 조회, null이면 `latest.json` 디스크 폴백 (cold start 1회만)

### frontend/src/App.jsx
- 전체 데이터 로딩 및 공항 선택 상태 관리
- 알림 평가/디스패치/쿨다운 처리
- 좌측(METAR/TAF/WARNING) + 우측(Lightning/Radar) 레이아웃
- `showRadar`, `radarOpacity` 설정 관리 및 `LightningMap` 연동.

### frontend/src/components/LightningMap.jsx
- `TST1` 공항 선택 및 설정 활성화 시 `/data/radar-tiles/TST1_latest.png` 오버레이 표시.
- 레이더 표시 시 `currentRangeKm`을 45km로 자동 조정하여 타일 좌표 정합성 확보.

... (중략) ...

---

최종 업데이트: 2026-02-21

### 주요 변경 이력 (최근)
- **2026-02-21**: **인메모리 캐시 API 서빙 적용**; `store.js`에 `getCached(type)` 게터 추가; `server.js`의 `readLatest`/`readLightning`이 캐시 우선 조회 후 cold start 시에만 디스크 폴백; `radar`/바이너리 데이터는 제외; `Scheduler_Cache_Design.md` §3.4·§8 업데이트. **WIND_SHEAR 중복 경보 제거**; `warning-parser.js`에 동일 유효시간 중복 skip 로직 추가; `Warning_Parsing_Algorithm.md` §3.4·§8 업데이트.
- **2026-02-20**: **고해상도 이진 레이더 타일 생성 및 중첩 기능 추가**; `generate-full-radar.js`, `generate-radar-tile.js` 테스트 스크립트 도입; Marshall-Palmer mm/h 변환 및 24단계 공식 색상 적용; Settings 내 레이더 오버레이 토글 및 투명도 조절 UI 추가; `TST1` 지역 우선 적용 및 축척(45km) 동기화 로직 구현.
- **2026-02-20**: UTC/KST 시간대 표시 전환 기능 추가; Settings 탭 구조 도입; TafTimeline v2 실제값 그룹화 원칙 적용.

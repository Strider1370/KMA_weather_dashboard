# KMA Aviation Weather Dashboard - 프로젝트 아키텍처

> 기상청(KMA) API를 사용하여 항공 기상 정보(METAR, TAF, 경보)를 수집하고 실시간 모니터링 및 알림 기능을 제공하는 웹 대시보드

## 📋 목차
- [프로젝트 개요](#프로젝트-개요)
- [최근 변경사항 (2026-02-10)](#최근-변경사항-2026-02-10)
- [기술 스택](#기술-스택)
- [디렉토리 구조](#디렉토리-구조)
- [데이터 플로우](#데이터-플로우)
- [핵심 컴포넌트](#핵심-컴포넌트)
- [파일 의존성 맵](#파일-의존성-맵)
- [API 엔드포인트](#api-엔드포인트)
- [알림 시스템](#알림-시스템)
- [실행 방법](#실행-방법)

---

## 프로젝트 개요

### 주요 기능
1. **데이터 수집**: KMA API에서 METAR, TAF, WARNING 데이터 자동 수집
2. **실시간 모니터링**: 8개 공항의 기상 정보 대시보드
3. **알림 시스템**: 7가지 트리거 기반 실시간 알림 (팝업, 사운드, 마퀴)
4. **데이터 캐싱**: 중복 데이터 필터링 및 이력 관리

### 수집 스케줄
- **METAR**: 10분마다
- **TAF**: 30분마다
- **WARNING**: 5분마다

---

## 최근 변경사항 (2026-02-10)

### 1. 런타임/실행 안정화
- `frontend/package.json`이 ESM(`type: "module"`)인 환경에서 CommonJS 서버를 안정적으로 실행하기 위해 `frontend/server.cjs`를 추가.
- 루트 스크립트(`project/package.json`)의 `dev`, `dashboard`를 `frontend/server.cjs` 기준으로 변경.
- `project/package.json` BOM 제거로 Vite/PostCSS JSON 파싱 오류 해결.

### 2. 낙뢰 지도 UI 통합
- `frontend/src/components/LightningMap.jsx` 신규 추가.
- `frontend/src/App.jsx`에서 메인 레이아웃을 좌측(기존 METAR/TAF/경보) + 우측(낙뢰 지도) 2단으로 재구성.
- `frontend/src/components/SummaryGrid.jsx`에 `Total Lightning` 타일 추가.
- `frontend/src/App.css`에 낙뢰 지도/범례/시간 필터 스타일 추가.

### 3. 낙뢰 Mock API 및 테스트 공항
- `frontend/server.cjs`에 `GET /api/lightning` 추가.
- `backend/data/lightning/mock/TST1.json` fixture 기반 mock 응답 지원.
- 기본 동작은 mock 활성화(`LIGHTNING_MOCK !== "0"`), 필요 시 `LIGHTNING_MOCK=0`으로 비활성화.
- `shared/airports.js`에 테스트 공항 `TST1` 추가.

### 4. 공항 선택/데이터 로딩 개선
- `frontend/src/utils/api.js`에서 `/api/lightning`을 optional 로딩으로 추가(미존재 시 null).
- `frontend/src/App.jsx`의 공항 목록/선택 유지 로직을 METAR/TAF/WARNING/LIGHTNING/공항목록 합집합 기준으로 보강.
- 폴링 중 `TST1`이 `RKSI`로 자동 전환되는 문제 해결.

### 5. 알림 시스템 낙뢰 연동
- `frontend/src/utils/alerts/alert-triggers.js`에 `lightning_detected`(T-08) 추가.
- `frontend/src/utils/alerts/alert-engine.js`에 `lightning` 카테고리 평가 경로 추가.
- `frontend/src/utils/alerts/alert-state.js`에 낙뢰 전용 alert key 처리 추가.
- `shared/alert-defaults.js`와 `AlertSettings.jsx`에 낙뢰 트리거 설정/라벨 추가.

---

## 기술 스택

### 백엔드
- **Node.js**: 런타임 환경
- **node-cron**: 스케줄러
- **fast-xml-parser**: KMA XML 파싱
- **dotenv**: 환경 변수 관리

### 프론트엔드
- **React 18**: UI 프레임워크
- **Vite**: 빌드 도구 (HMR 지원)
- **Vanilla CSS**: 스타일링

### 개발 도구
- **concurrently**: 병렬 프로세스 실행

---

## 디렉토리 구조

```
project/
├── backend/                      # 백엔드 (데이터 수집 및 처리)
│   ├── src/
│   │   ├── parsers/              # XML 파서
│   │   │   ├── parse-utils.js    # 공통 파싱 유틸리티
│   │   │   ├── metar-parser.js   # METAR XML → JSON
│   │   │   ├── taf-parser.js     # TAF XML → JSON
│   │   │   └── warning-parser.js # WARNING XML → JSON
│   │   ├── processors/           # 데이터 처리
│   │   │   ├── metar-processor.js
│   │   │   ├── taf-processor.js
│   │   │   └── warning-processor.js
│   │   ├── index.js              # 스케줄러 메인
│   │   ├── config.js             # API 설정 (endpoints, auth_key)
│   │   └── store.js              # 캐싱 및 파일 관리
│   ├── data/                     # 수집된 데이터 저장소
│   │   ├── metar/
│   │   │   ├── latest.json
│   │   │   └── METAR_*.json
│   │   ├── taf/
│   │   │   ├── latest.json
│   │   │   └── TAF_*.json
│   │   └── warning/
│   │       ├── latest.json
│   │       └── WARNINGS_*.json
│   └── test/
│       └── run-once.js           # 수동 데이터 수집 스크립트
│
├── frontend/                     # 프론트엔드 (React + Vite)
│   ├── src/
│   │   ├── components/           # React 컴포넌트
│   │   │   ├── Header.jsx        # 헤더 + 설정 버튼
│   │   │   ├── SummaryGrid.jsx   # 메트릭 타일 (4개)
│   │   │   ├── StatusPanel.jsx   # 데이터 수집 현황
│   │   │   ├── Controls.jsx      # 공항 선택 + 새로고침
│   │   │   ├── MetarCard.jsx     # METAR 표시
│   │   │   ├── WarningList.jsx   # 경보 목록
│   │   │   ├── TafTimeline.jsx   # TAF 시간별 테이블
│   │   │   └── alerts/           # 알림 UI
│   │   │       ├── AlertPopup.jsx    # 우상단 토스트
│   │   │       ├── AlertSound.jsx    # 비프음
│   │   │       ├── AlertMarquee.jsx  # 하단 스크롤 바
│   │   │       └── AlertSettings.jsx # 설정 모달
│   │   ├── utils/
│   │   │   ├── api.js            # API 호출 함수
│   │   │   ├── helpers.js        # 유틸리티 (formatUtc, getSeverityLevel 등)
│   │   │   └── alerts/           # 알림 시스템 로직
│   │   │       ├── alert-triggers.js    # 7개 트리거 정의
│   │   │       ├── alert-engine.js      # 평가 엔진
│   │   │       ├── alert-state.js       # 중복 방지 + 쿨다운
│   │   │       ├── alert-dispatcher.js  # 디스패치
│   │   │       ├── alert-settings.js    # 설정 병합
│   │   │       └── index.js             # barrel export
│   │   ├── App.jsx               # 루트 컴포넌트
│   │   ├── App.css               # 메인 스타일
│   │   └── main.jsx              # React 엔트리포인트
│   ├── legacy/                   # 기존 vanilla JS 백업
│   │   ├── app.js
│   │   ├── index.html
│   │   └── styles.css
│   ├── dist/                     # Vite 빌드 출력 (프로덕션)
│   ├── index.html                # Vite 엔트리 HTML
│   ├── vite.config.js            # Vite 설정 (dev proxy)
│   ├── package.json              # React/Vite 의존성
│   └── server.js                 # API 서버 + 정적 파일 서빙
│
├── shared/                       # 공유 데이터
│   ├── airports.js               # 공항 목록 (RKSI, RKSS 등)
│   ├── warning-types.js          # 경보 타입 매핑
│   └── alert-defaults.js         # 알림 기본 설정
│
├── docs/                         # 설계 문서
│   ├── METAR_Parsing_Algorithm.md
│   ├── TAF_Parsing_Algorithm.md
│   ├── Warning_Data_Schema.md
│   ├── Scheduler_Cache_Design.md
│   ├── Visualization_Spec.md
│   └── Alert_System_Design.md
│
├── .env                          # 환경 변수 (API_AUTH_KEY)
├── package.json                  # 루트 패키지 (스크립트)
├── WORK_SUMMARY.md               # 작업 이력
├── IMPLEMENTATION_PLAN.md        # 구현 계획
└── PROJECT_ARCHITECTURE.md       # 이 문서
```

---

## 데이터 플로우

### 1. 데이터 수집 플로우
```
KMA API (XML)
    ↓
backend/src/processors/*.js (API 호출)
    ↓
backend/src/parsers/*.js (XML → JSON 변환)
    ↓
backend/src/store.js (캐싱, 중복 체크, 파일 저장)
    ↓
backend/data/[metar|taf|warning]/latest.json
```

### 2. 프론트엔드 데이터 플로우
```
frontend/src/utils/api.js (fetch)
    ↓
frontend/server.js (API 엔드포인트)
    ↓
backend/data/*/latest.json 읽기
    ↓
App.jsx (React state)
    ↓
컴포넌트 렌더링 (Header, MetarCard, TafTimeline 등)
```

### 3. 알림 플로우
```
App.jsx (useEffect - 데이터 변경 감지)
    ↓
alert-engine.js (트리거 평가)
    ↓
alert-state.js (중복 체크, 쿨다운)
    ↓
alert-dispatcher.js (디스패치)
    ↓
AlertPopup / AlertSound / AlertMarquee (UI 표시)
```

---

## 핵심 컴포넌트

### 백엔드

#### 1. `backend/src/index.js` (스케줄러)
- **역할**: cron 스케줄러로 주기적 데이터 수집
- **의존성**:
  - `node-cron`
  - `./config`
  - `./store`
  - `./processors/*-processor`
- **주요 기능**:
  - Lock 기반 중복 실행 방지
  - 에러 핸들링 및 로깅

#### 2. `backend/src/config.js` (설정)
- **역할**: API 엔드포인트, 인증 키, 스케줄 설정
- **환경 변수**: `.env` 파일에서 로드
  - `API_AUTH_KEY`: KMA API 인증 키
  - `API_BASE_URL`: API 베이스 URL
  - `DATA_PATH`: 데이터 저장 경로
- **주요 설정**:
  - `numOfRows: 10` (KMA API 조회 개수)
  - `schedule`: cron 표현식

#### 3. `backend/src/store.js` (캐싱)
- **역할**: 데이터 저장, 중복 체크, 파일 회전
- **주요 함수**:
  - `save(type, data)`: 데이터 저장 (hash 기반 중복 체크)
  - `canonicalHash(result)`: SHA-256 해시 생성
  - `mergeWithPrevious(result, type, failedAirports)`: 실패한 공항 데이터는 이전 캐시 사용 (_stale)
  - `rotateFiles(dir, maxCount)`: 최대 10개 파일 유지

#### 4. `backend/src/parsers/*.js` (파서)
- **METAR 파서** (`metar-parser.js`):
  - XML → JSON 변환
  - CAVOK/NSC 처리
  - Wind shear 파싱
  - `display` 필드 생성 (시정, 구름, 바람, 온도, QNH)

- **TAF 파서** (`taf-parser.js`):
  - 변경군 병합 (BECMG, TEMPO, PROB*)
  - 1시간 간격 타임라인 생성
  - TX/TN 온도 파싱

- **WARNING 파서** (`warning-parser.js`):
  - 경보 타입 매핑
  - 공항별 경보 그룹핑
  - 시간 오름차순 정렬

#### 5. `backend/src/processors/*.js` (프로세서)
- **역할**: KMA API 호출 → 파싱 → 저장
- **의존성**:
  - `./config` (API 설정)
  - `./parsers/*-parser` (파서)
  - `./store` (저장)
- **에러 처리**:
  - 재시도 로직 (max_retries: 3)
  - 타임아웃 (10초)

### 프론트엔드

#### 1. `frontend/src/App.jsx` (메인 앱)
- **역할**: 전역 상태 관리, 알림 평가, 자동 폴링
- **State**:
  - `data`: METAR, TAF, WARNING 데이터
  - `selectedAirport`: 선택된 공항
  - `activeAlerts`: 활성 알림 목록
  - `alertDefaults`: 알림 기본 설정
- **Effects**:
  - 데이터 로드 (최초 1회)
  - 알림 평가 (데이터 변경 시)
  - 자동 폴링 (30초마다)
- **의존성**:
  - `./utils/api` (데이터 로드)
  - `./utils/alerts` (알림 시스템)
  - `./components/*` (UI 컴포넌트)

#### 2. `frontend/src/utils/api.js` (API 호출)
- **함수**:
  - `fetchJson(url)`: JSON fetch wrapper
  - `loadAllData()`: 모든 데이터 병렬 로드
  - `loadAlertDefaults()`: 알림 설정 로드
  - `triggerRefresh()`: 수동 데이터 수집 트리거

#### 3. `frontend/src/utils/helpers.js` (유틸리티)
- **함수**:
  - `safe(value, fallback)`: null-safe 값 반환
  - `formatUtc(iso)`: ISO 시간 → "YYYY-MM-DD HH:mm UTC"
  - `getSeverityLevel({visibility, wind, gust})`: 위험도 계산 (ok/warn/danger)
  - `severityLabel(level)`: 위험도 라벨

#### 4. 알림 시스템 (`frontend/src/utils/alerts/`)

##### `alert-triggers.js` (트리거 정의)
7개 트리거:
1. **T-01**: `warning_issued` - 경보 발령
2. **T-02**: `warning_cleared` - 경보 해제
3. **T-03**: `low_visibility` - 저시정 (< 1500m)
4. **T-04**: `high_wind` - 강풍 (≥ 25kt 또는 돌풍 ≥ 35kt)
5. **T-05**: `weather_phenomenon` - 위험 기상현상 (TS, SN, FZRA 등)
6. **T-06**: `low_ceiling` - 저운고 (< 500ft, BKN/OVC)
7. **T-07**: `taf_adverse_weather` - TAF 악기상 예보 (6시간 이내)

각 트리거는 다음 형태:
```javascript
{
  id: "T-01",
  name: "경보 발령",
  evaluate: (current, previous, params) => {
    // 평가 로직
    // return { triggered: boolean, severity: "info"|"warning"|"critical", message: string }
  }
}
```

##### `alert-engine.js` (평가 엔진)
- `evaluate(currentData, previousData, settings)`: 모든 트리거 평가
- 활성화된 트리거만 실행
- 결과: `[{ id, name, severity, message, timestamp }]`

##### `alert-state.js` (중복 방지)
- `buildAlertKey(result, icao)`: 고유 키 생성 (`${id}:${icao}`)
- `isInCooldown(key, cooldownSeconds)`: 쿨다운 체크 (기본 5분)
- `recordAlert(key)`: 알림 발생 기록
- `clearResolvedAlerts(firedKeys)`: 해결된 알림 제거

##### `alert-dispatcher.js` (디스패치)
- `dispatch(result, dispatcherSettings, icao)`: 알림 전송
- `setAlertCallback(fn)`: React 콜백 등록
- `isQuietHours(quietHoursConfig)`: 조용 시간 체크

##### `alert-settings.js` (설정 병합)
- `resolveSettings(defaults)`: 서버 기본값 + localStorage 병합
- `savePersonalSettings(settings)`: localStorage 저장
- `clearPersonalSettings()`: 초기화

#### 5. 알림 UI 컴포넌트

##### `AlertPopup.jsx`
- 우상단 토스트 알림
- severity별 색상 (info: 파랑, warning: 주황, critical: 빨강)
- 자동 dismiss (10초)
- 최대 5개 표시

##### `AlertSound.jsx`
- Web Audio API 비프음
- critical은 3회 반복
- 볼륨 조절 가능 (0-100)

##### `AlertMarquee.jsx`
- 하단 스크롤 바
- warning 이상 severity만 표시
- 30초간 표시 후 자동 숨김

##### `AlertSettings.jsx`
- 설정 모달 (기어 아이콘 클릭)
- 트리거별 on/off, 임계값 조정
- 디스패처별 on/off
- 전역 설정 (쿨다운, 조용시간, 폴링 간격)
- localStorage 저장

#### 6. 기타 컴포넌트

##### `Header.jsx`
- 타이틀 + 마지막 업데이트 시각
- 설정 버튼 (⚙)

##### `SummaryGrid.jsx`
- 4개 메트릭 타일 (METAR, TAF, WARNING 개수)

##### `StatusPanel.jsx`
- 데이터 수집 현황 (마지막 업데이트, 캐시 파일 개수)
- 스케줄 정보 표시

##### `Controls.jsx`
- 공항 선택 드롭다운
- 새로고침 버튼

##### `MetarCard.jsx`
- METAR 정보 표시
- severity 색상 (초록/주황/빨강 테두리)

##### `WarningList.jsx`
- 경보 목록 (공항별)
- 경보 타입별 색상

##### `TafTimeline.jsx`
- TAF 시간별 테이블
- severity 행 배경색

### 서버

#### `frontend/server.js` (API 서버)
- **역할**: HTTP 서버 (API 엔드포인트 + 정적 파일 서빙)
- **포트**: 5173
- **주요 엔드포인트**:
  - `GET /api/metar` → `backend/data/metar/latest.json`
  - `GET /api/taf` → `backend/data/taf/latest.json`
  - `GET /api/warning` → `backend/data/warning/latest.json`
  - `GET /api/status` → 데이터 수집 현황
  - `GET /api/airports` → `shared/airports.js`
  - `GET /api/warning-types` → `shared/warning-types.js`
  - `GET /api/alert-defaults` → `shared/alert-defaults.js`
  - `POST /api/refresh` → 수동 데이터 수집 트리거
  - `GET /*` → `frontend/dist/` 정적 파일 서빙
- **시작 시**: 백엔드 스케줄러 자동 실행 (`backend/src/index.js`)

---

## 파일 의존성 맵

### 백엔드 의존성

```
backend/src/index.js
├── node-cron
├── ./config
├── ./store
└── ./processors/
    ├── metar-processor.js
    ├── taf-processor.js
    └── warning-processor.js

backend/src/processors/metar-processor.js
├── ./config
├── ./parsers/metar-parser
└── ./store

backend/src/parsers/metar-parser.js
├── fast-xml-parser
└── ./parse-utils

backend/src/config.js
├── dotenv
└── ../../shared/airports

backend/src/store.js
├── crypto (Node.js built-in)
├── fs (Node.js built-in)
├── path (Node.js built-in)
└── ./config
```

### 프론트엔드 의존성

```
frontend/src/App.jsx
├── react
├── ./utils/api
├── ./utils/alerts (barrel export)
└── ./components/
    ├── Header
    ├── SummaryGrid
    ├── StatusPanel
    ├── Controls
    ├── MetarCard
    ├── WarningList
    ├── TafTimeline
    └── alerts/
        ├── AlertPopup
        ├── AlertSound
        ├── AlertMarquee
        └── AlertSettings

frontend/src/utils/alerts/index.js (barrel export)
├── ./alert-engine (evaluate)
├── ./alert-state (buildAlertKey, isInCooldown, recordAlert, clearResolvedAlerts)
├── ./alert-dispatcher (dispatch, isQuietHours, setAlertCallback)
└── ./alert-settings (resolveSettings, savePersonalSettings 등)

frontend/src/utils/alerts/alert-engine.js
└── ./alert-triggers (TRIGGERS 배열)

frontend/src/utils/alerts/alert-triggers.js
└── (독립 모듈, 7개 트리거 정의)

frontend/src/utils/alerts/alert-state.js
└── (독립 모듈, localStorage 사용)

frontend/src/utils/alerts/alert-dispatcher.js
└── (독립 모듈, 콜백 기반)

frontend/src/utils/alerts/alert-settings.js
└── (독립 모듈, localStorage 사용)
```

### 서버 의존성

```
frontend/server.js
├── http (Node.js built-in)
├── fs (Node.js built-in)
├── path (Node.js built-in)
├── ../backend/src/index (스케줄러)
├── ../backend/data/ (데이터 파일 읽기)
└── ../shared/ (공유 데이터)
    ├── airports.js
    ├── warning-types.js
    └── alert-defaults.js
```

---

## API 엔드포인트

### 데이터 API

| 메서드 | 경로 | 설명 | 응답 예시 |
|--------|------|------|-----------|
| GET | `/api/metar` | METAR 데이터 (전체 공항) | `{ type: "metar", fetched_at: "...", airports: {...} }` |
| GET | `/api/taf` | TAF 데이터 (전체 공항) | `{ type: "taf", fetched_at: "...", airports: {...} }` |
| GET | `/api/warning` | 경보 데이터 (전체 공항) | `{ type: "warning", fetched_at: "...", airports: {...}, total_count: 10 }` |
| GET | `/api/status` | 데이터 수집 현황 | `{ metar: { exists: true, last_updated: "...", file_count: 3 }, ... }` |
| GET | `/api/airports` | 공항 목록 | `[{ icao: "RKSI", name: "인천", ... }]` |
| GET | `/api/warning-types` | 경보 타입 매핑 | `{ "00": { key: "WINDSHEAR", name: "윈드시어", ... } }` |
| GET | `/api/alert-defaults` | 알림 기본 설정 | `{ global: {...}, triggers: {...}, dispatchers: {...} }` |
| POST | `/api/refresh` | 수동 데이터 수집 | `{ success: true }` |

### 데이터 구조

#### METAR 응답 (`/api/metar`)
```json
{
  "type": "metar",
  "fetched_at": "2026-02-10T10:00:00Z",
  "airports": {
    "RKSI": {
      "header": {
        "icao": "RKSI",
        "airport_name": "인천국제공항",
        "issue_time": "2026-02-10T09:00:00Z",
        "observation_time": "2026-02-10T09:00:00Z",
        "automated": false
      },
      "observation": {
        "wind": { "direction": 170, "speed": 8, "unit": "KT", "raw": "17008KT" },
        "visibility": { "value": 9999, "cavok": true },
        "weather": [],
        "clouds": [],
        "temperature": { "air": 4, "dewpoint": 1 },
        "qnh": { "value": 1013, "unit": "hPa" },
        "wind_shear": null,
        "display": {
          "wind": "17008KT",
          "visibility": "9999",
          "weather": "",
          "clouds": "NSC",
          "temperature": "04/01",
          "qnh": "Q1013",
          "weather_icon": "CAVOK",
          "weather_intensity": null
        }
      },
      "cavok_flag": true,
      "nsc_flag": false
    }
  }
}
```

#### TAF 응답 (`/api/taf`)
```json
{
  "type": "taf",
  "fetched_at": "2026-02-10T10:00:00Z",
  "airports": {
    "RKSI": {
      "header": {
        "icao": "RKSI",
        "airport_name": "인천국제공항",
        "issued": "2026-02-10T06:00:00Z",
        "valid_start": "2026-02-10T06:00:00Z",
        "valid_end": "2026-02-11T12:00:00Z",
        "temperatures": {
          "max": { "value": 4, "time": "2026-02-10T10:00:00Z" },
          "min": { "value": 1, "time": "2026-02-10T09:00:00Z" }
        }
      },
      "timeline": [
        {
          "time": "2026-02-10T06:00:00Z",
          "wind": { "direction": 170, "speed": 8, "raw": "17008KT" },
          "visibility": { "value": 9999, "cavok": true },
          "weather": [],
          "clouds": [],
          "display": {
            "wind": "17008KT",
            "visibility": "9999",
            "weather": "",
            "clouds": "NSC",
            "weather_icon": "CAVOK",
            "weather_intensity": null
          }
        }
      ]
    }
  }
}
```

#### WARNING 응답 (`/api/warning`)
```json
{
  "type": "warning",
  "fetched_at": "2026-02-10T10:00:00Z",
  "total_count": 1,
  "airports": {
    "RKSI": {
      "icao": "RKSI",
      "airport_name": "인천국제공항",
      "warnings": [
        {
          "wrng_type": "00",
          "wrng_type_key": "WINDSHEAR",
          "wrng_type_name": "윈드시어",
          "valid_start": "2026-02-10T09:00:00Z",
          "valid_end": "2026-02-10T12:00:00Z"
        }
      ]
    }
  }
}
```

---

## 알림 시스템

### 아키텍처

```
데이터 변경 감지 (App.jsx useEffect)
    ↓
알림 평가 (alert-engine.js)
    ↓
트리거 체크 (alert-triggers.js) → 7개 트리거
    ↓
중복 방지 (alert-state.js) → 쿨다운 체크
    ↓
디스패치 (alert-dispatcher.js)
    ↓
UI 표시 (AlertPopup / AlertSound / AlertMarquee)
```

### 트리거 세부사항

| ID | 이름 | 조건 | Severity |
|----|------|------|----------|
| T-01 | 경보 발령 | 새 경보 발생 | critical |
| T-02 | 경보 해제 | 경보 해제됨 | info |
| T-03 | 저시정 | visibility < 1500m | warning/critical |
| T-04 | 강풍 | speed ≥ 25kt or gust ≥ 35kt | warning/critical |
| T-05 | 기상현상 | TS, SN, FZRA 등 | warning/critical |
| T-06 | 저운고 | ceiling < 500ft (BKN/OVC) | warning/critical |
| T-07 | TAF 악기상 | 6시간 이내 악기상 예보 | warning |

### 설정 구조 (`shared/alert-defaults.js`)

```javascript
{
  global: {
    alerts_enabled: true,           // 알림 전역 활성화
    poll_interval_seconds: 30,      // 폴링 간격
    cooldown_seconds: 300,          // 쿨다운 (5분)
    quiet_hours: null               // 조용 시간 { start: "22:00", end: "06:00" }
  },

  triggers: {
    warning_issued: {
      enabled: true,
      params: { types: ["00", "1", "2", ...] }  // 대상 경보 타입
    },
    low_visibility: {
      enabled: true,
      params: { threshold: 1500 }    // 임계값 (m)
    },
    // ... 7개 트리거
  },

  dispatchers: {
    popup: {
      enabled: true,
      auto_dismiss_seconds: 10,      // 자동 닫힘
      max_visible: 5,                // 최대 표시 개수
      position: "top-right"
    },
    sound: {
      enabled: true,
      volume: 70,                    // 볼륨 (0-100)
      repeat_count: { info: 1, warning: 1, critical: 3 }
    },
    marquee: {
      enabled: true,
      min_severity: "warning",       // 최소 severity
      speed: "normal",
      show_duration_seconds: 30
    }
  }
}
```

### 설정 우선순위

1. **localStorage** (개인 설정) - 최우선
2. **shared/alert-defaults.js** (서버 기본값) - 폴백

설정 병합: `alert-settings.js`의 `resolveSettings(defaults)`

---

## 실행 방법

### 환경 설정

1. **의존성 설치**:
```bash
# 루트 의존성 (스케줄러)
npm install

# 프론트엔드 의존성 (React)
cd frontend && npm install && cd ..
```

2. **환경 변수 설정** (`.env`):
```env
API_AUTH_KEY=your_kma_api_key
API_BASE_URL=https://apihub.kma.go.kr/api/typ02/openApi
DATA_PATH=./backend/data
```

### 실행 모드

#### 1. 개발 모드 (추천)
```bash
npm run dev
```
- **API 서버**: http://localhost:5173 (스케줄러 포함)
- **Vite dev**: http://localhost:5174 (HMR, React 앱)
- **특징**:
  - 코드 변경 시 자동 새로고침
  - 자동 데이터 수집 (10분/30분/5분 간격)

#### 2. 프로덕션 모드
```bash
# 프론트엔드 빌드
cd frontend && npm run build && cd ..

# 서버 실행
npm run dashboard
```
- **서버**: http://localhost:5173
- **특징**:
  - 빌드된 React 앱 서빙 (`frontend/dist/`)
  - 스케줄러 자동 실행

#### 3. 백엔드만 실행
```bash
npm start
```
- 스케줄러만 실행 (데이터 수집)
- 프론트엔드 없음

#### 4. 수동 데이터 수집
```bash
# 전체 수집
npm test

# METAR만
node backend/test/run-once.js metar

# TAF만
node backend/test/run-once.js taf

# WARNING만
node backend/test/run-once.js warning
```

---

## 트러블슈팅

### 문제 1: `numOfRows` 설정
- **증상**: 경보 데이터 누락
- **원인**: `backend/src/config.js`의 `numOfRows: 10` (너무 작음)
- **해결**: `numOfRows: 500` 또는 필요한 값으로 변경

### 문제 2: `frontend/dist/` 없음
- **증상**: 프로덕션 모드 실행 불가
- **해결**: `cd frontend && npm run build`

### 문제 3: API 에러 (APPLICATION_ERROR)
- **원인**: KMA API 불안정, 인증 키 오류
- **해결**:
  - `.env`의 `API_AUTH_KEY` 확인
  - 재시도 (자동 재시도 3회)
  - 캐시 데이터 사용 (`_stale` 플래그)

### 문제 4: 알림 안 나옴
- **확인 사항**:
  1. 설정 모달 (⚙) → 알림 활성화 확인
  2. 트리거별 활성화 상태
  3. 쿨다운 시간 (기본 5분)
  4. 조용 시간 설정
  5. 브라우저 콘솔에서 에러 확인

---

## 참고 문서

- [WORK_SUMMARY.md](WORK_SUMMARY.md) - 작업 이력
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - 구현 계획 (21개 체크포인트)
- [docs/Alert_System_Design.md](docs/Alert_System_Design.md) - 알림 시스템 설계
- [docs/METAR_Parsing_Algorithm.md](docs/METAR_Parsing_Algorithm.md) - METAR 파싱 알고리즘
- [docs/TAF_Parsing_Algorithm.md](docs/TAF_Parsing_Algorithm.md) - TAF 파싱 알고리즘
- [docs/Warning_Data_Schema.md](docs/Warning_Data_Schema.md) - 경보 데이터 스키마

---

## 라이센스

(프로젝트 라이센스 명시)

---

**최종 업데이트**: 2026-02-10
**작성자**: Claude Sonnet 4.5

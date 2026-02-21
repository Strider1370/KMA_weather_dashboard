# API 수집 실패 통계 설계문서

## 1. 개요

### 1.1 목적
KMA 공공데이터 API의 간헐적 실패(APPLICATION_ERROR 등)를 기록하고,
타입별·공항별·에러 유형별 통계를 영구 보존하여 API 서버 과실 증거 자료로 활용한다.

### 1.2 핵심 파일
- `backend/src/stats.js`: 인메모리 통계 + 파일 저장 모듈
- `backend/src/index.js`: `runWithLock()`에서 stats 훅 호출
- `frontend/server.js`: `/api/stats` 엔드포인트
- `frontend/src/components/StatsPanel.jsx`: detailsOpen 패널 내 표시 컴포넌트

---

## 2. 데이터 구조

### 2.1 저장 경로
```
backend/data/stats/latest.json
```

파일 회전 없음 — 단일 파일에 누적 유지.

### 2.2 JSON 스키마

```json
{
  "since": "2026-02-21T12:00:00.000Z",
  "types": {
    "metar": {
      "total_runs": 48,
      "success": 46,
      "failure": 2,
      "last_run": "2026-02-21T13:00:00.000Z",
      "last_failure": "2026-02-21T12:30:00.000Z",
      "last_error": "APPLICATION_ERROR",
      "error_counts": {
        "APPLICATION_ERROR": 1,
        "Connection timeout": 1
      },
      "airport_failures": {
        "RKSI": 3,
        "RKSS": 1
      }
    },
    "taf": {
      "total_runs": 16,
      "success": 15,
      "failure": 1,
      "last_run": "2026-02-21T13:00:00.000Z",
      "last_failure": "2026-02-21T12:30:00.000Z",
      "last_error": "fetch failed",
      "error_counts": {
        "fetch failed": 1
      },
      "airport_failures": {
        "RKJB": 2
      }
    },
    "warning": {
      "total_runs": 100,
      "success": 74,
      "failure": 26,
      "last_run": "2026-02-21T13:00:00.000Z",
      "last_failure": "2026-02-21T12:55:00.000Z",
      "last_error": "APPLICATION_ERROR",
      "error_counts": {
        "APPLICATION_ERROR": 23,
        "Connection timeout": 3
      },
      "airport_failures": {}
    },
    "lightning": {
      "total_runs": 240,
      "success": 238,
      "failure": 2,
      "last_run": "2026-02-21T13:00:00.000Z",
      "last_failure": null,
      "last_error": null,
      "error_counts": {},
      "airport_failures": {
        "RKPU": 1
      }
    },
    "radar": {
      "total_runs": 100,
      "success": 98,
      "failure": 2,
      "last_run": "2026-02-21T13:00:00.000Z",
      "last_failure": "2026-02-21T11:00:00.000Z",
      "last_error": "No valid radar image found",
      "error_counts": {
        "No valid radar image found": 2
      },
      "airport_failures": {}
    }
  },
  "recent_runs": [
    {
      "type": "warning",
      "time": "2026-02-21T12:55:00.000Z",
      "success": false,
      "error": "APPLICATION_ERROR",
      "failed_airports": []
    },
    {
      "type": "metar",
      "time": "2026-02-21T12:50:00.000Z",
      "success": true,
      "error": null,
      "failed_airports": ["RKSI", "RKSS"]
    }
  ]
}
```

### 2.3 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `since` | ISO string | 통계 시작 시각 (서버 최초 기동 시각) |
| `types[t].total_runs` | number | 해당 타입 전체 실행 횟수 |
| `types[t].success` | number | 프로세서가 정상 반환한 횟수 |
| `types[t].failure` | number | 프로세서가 throw한 횟수 |
| `types[t].error_counts` | object | 에러 메시지별 발생 횟수 (핵심 증거 필드) |
| `types[t].airport_failures` | object | 공항 ICAO → 부분 실패 누적 횟수 (metar/taf/lightning) |
| `recent_runs` | array | 최신 50건 수집 이력, 역순 정렬 |
| `recent_runs[].failed_airports` | array | 해당 실행에서 실패한 공항 목록 (성공 실행에서도 partial failure 기록) |

### 2.4 성공 vs 실패 판단 기준

| 타입 | 성공 | 실패 |
|------|------|------|
| metar / taf | 프로세서 정상 반환 (공항 partial failure 있어도 성공으로 분류) | 프로세서 throw |
| warning | 파싱 완료 | APPLICATION_ERROR 등 throw |
| lightning | 프로세서 정상 반환 | throw |
| radar | PNG 저장 성공 | throw |

> 공항별 partial failure (`failedAirports`)는 성공 실행 내에서 별도 집계.

---

## 3. 백엔드 모듈 (`backend/src/stats.js`)

### 3.1 인메모리 구조

```js
const TYPES = ["metar", "taf", "warning", "lightning", "radar"];
const MAX_RECENT_RUNS = 50;

let statsData = {
  since: new Date().toISOString(),
  types: Object.fromEntries(TYPES.map(t => [t, {
    total_runs: 0, success: 0, failure: 0,
    last_run: null, last_failure: null, last_error: null,
    error_counts: {}, airport_failures: {}
  }])),
  recent_runs: []
};

let statsFilePath = null;
```

### 3.2 함수 명세

#### `initFromFile(basePath)`
- `backend/data/stats/` 디렉토리 생성 (없으면)
- `latest.json` 존재 시 읽어서 `statsData` 복원 (재시작 후 누적 유지)
- `statsFilePath` 설정

#### `recordSuccess(type, result)`
- `total_runs++`, `success++`, `last_run` 갱신
- `result.failedAirports` 배열 각 ICAO에 대해 `airport_failures[icao]++`
- `recent_runs`에 `{ type, time, success: true, error: null, failed_airports }` prepend
- `saveToFile()` 호출

#### `recordFailure(type, errorMsg)`
- `total_runs++`, `failure++`, `last_run` / `last_failure` / `last_error` 갱신
- `error_counts[errorMsg]++` (에러 유형별 집계)
- `recent_runs`에 `{ type, time, success: false, error: errorMsg, failed_airports: [] }` prepend
- `saveToFile()` 호출

#### `saveToFile()`
- `statsFilePath`에 `JSON.stringify(statsData, null, 2)` 동기 write

#### `getStats()`
- `statsData` 반환

### 3.3 훅 위치 (`backend/src/index.js`)

```js
const stats = require("./stats");

async function runWithLock(type, job) {
  // ... 락 처리 ...
  try {
    const result = await job();
    console.log(...);
    stats.recordSuccess(type, result);   // ← 추가
  } catch (error) {
    console.error(...);
    stats.recordFailure(type, error.message);  // ← 추가
  } finally {
    locks[type] = false;
  }
}

async function main() {
  store.ensureDirectories(config.storage.base_path);
  store.initFromFiles(config.storage.base_path);
  stats.initFromFile(config.storage.base_path);   // ← 추가
  // ...
}
```

---

## 4. API 엔드포인트

`GET /api/stats`

- `frontend/server.js`에 라우터 추가
- `statsModule.getStats()` 반환 (인메모리)
- cold start fallback 불필요 (stats는 항상 initFromFile 후 메모리에 존재)

```js
const statsModule = require("../backend/src/stats");

// ...

if (req.url === "/api/stats") {
  return sendJson(res, 200, statsModule.getStats());
}
```

---

## 5. 프론트엔드 UI

### 5.1 위치
`detailsOpen` 패널 내 맨 아래:
`SummaryGrid` → `StatusPanel` → **`StatsPanel`**

별도 Header 버튼 없음.

### 5.2 StatsPanel 컴포넌트 (`frontend/src/components/StatsPanel.jsx`)

Props: `stats` (statsData 객체)

#### 표 1: 타입별 수집 통계

| 타입 | 전체 실행 | 성공 | 실패 | 성공률 | 마지막 실행 | 마지막 실패 에러 |
|------|---------|------|------|--------|------------|----------------|
| METAR | 48 | 46 | 2 | 95.8% | 21:00 KST | APPLICATION_ERROR |
| TAF | 16 | 15 | 1 | 93.8% | 21:00 KST | fetch failed |
| WARNING | 100 | 74 | 26 | 74.0% | 21:00 KST | APPLICATION_ERROR |
| LIGHTNING | 240 | 238 | 2 | 99.2% | 21:00 KST | — |
| RADAR | 100 | 98 | 2 | 98.0% | 21:00 KST | No valid radar image |

#### 표 2: 에러 유형별 집계 (전 타입 합산, KMA 서버 과실 증거)

| 에러 메시지 | 횟수 |
|------------|------|
| APPLICATION_ERROR | 24 |
| Connection timeout | 4 |
| No valid radar image found | 2 |

#### 표 3: 공항별 부분 실패 횟수 (metar/taf/lightning 합산)

| 공항 | METAR | TAF | Lightning | 합계 |
|------|-------|-----|-----------|------|
| RKSI | 3 | 0 | 0 | 3 |
| RKJB | 0 | 2 | 0 | 2 |
| RKPU | 0 | 0 | 1 | 1 |

#### 표 4: 최근 수집 이력 (최신 20건)

| 시각 | 타입 | 결과 | 에러 메시지 | 실패 공항 |
|------|------|------|------------|---------|
| 21:00 KST | WARNING | ❌ | APPLICATION_ERROR | — |
| 21:00 KST | METAR | ✅ | — | RKSI, RKSS |
| 20:55 KST | WARNING | ❌ | APPLICATION_ERROR | — |

### 5.3 데이터 로딩 (`frontend/src/App.jsx`)

`loadAll()` 시 `/api/stats`를 추가 fetch하여 `statsData` state 관리.
StatsPanel은 `detailsOpen && statsData` 조건 하에 렌더링.

---

## 6. 구현 파일 목록

| 파일 | 변경 종류 |
|------|---------|
| `backend/src/stats.js` | NEW |
| `backend/src/index.js` | `stats` require + `initFromFile` + `recordSuccess/Failure` 훅 |
| `frontend/server.js` | `statsModule` require + `/api/stats` 라우터 |
| `frontend/src/utils/api.js` | `fetchStats()` 추가 |
| `frontend/src/components/StatsPanel.jsx` | NEW |
| `frontend/src/App.jsx` | `statsData` state + `StatsPanel` 렌더링 |

---

## 7. 검증 체크리스트

| # | 테스트 케이스 | 기대 결과 |
|---|------|------|
| 1 | 서버 최초 기동 | `backend/data/stats/latest.json` 생성, `since` 설정 |
| 2 | 수집 정상 완료 | `success++`, `last_run` 갱신, `recent_runs` prepend |
| 3 | API APPLICATION_ERROR 발생 | `failure++`, `error_counts.APPLICATION_ERROR++` |
| 4 | metar 공항 partial failure | `airport_failures[ICAO]++`, 해당 실행은 success 집계 |
| 5 | 서버 재시작 | `since` 유지, 기존 통계 누적 보존 |
| 6 | `detailsOpen` 열기 | StatsPanel 4개 표 정상 표시 |
| 7 | `/api/stats` 직접 요청 | statsData JSON 반환 |

---

최초 작성: 2026-02-21

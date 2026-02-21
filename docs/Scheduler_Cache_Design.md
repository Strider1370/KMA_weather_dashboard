# 스케줄러 및 캐싱 설계문서

## 1. 개요

### 1.1 목적
METAR, TAF, 공항경보, 낙뢰, 레이더 데이터를 주기적으로 수집하고, 변경 감지/파일 보관/최신본 갱신을 일관되게 관리한다.

### 1.2 실제 구현 기준 파일
- `backend/src/index.js`: 스케줄러 + 실행 락
- `backend/src/store.js`: canonical hash, latest 갱신, 파일 순환, 캐시 복원
- `backend/src/processors/*.js`: 데이터 타입별 수집/파싱/저장 오케스트레이션

---

## 2. 스케줄 설계

### 2.1 주기
`backend/src/config.js` 기준:

| 데이터 | Cron | 주기 |
|---|---|---|
| METAR | `*/10 * * * *` | 10분 |
| TAF | `*/30 * * * *` | 30분 |
| WARNING | `*/5 * * * *` | 5분 |
| LIGHTNING | `*/3 * * * *` | 3분 |
| RADAR | `*/5 * * * *` | 5분 |

### 2.2 실행 락
`backend/src/index.js`의 `runWithLock(type, job)`가 동일 타입 중복 실행을 방지한다.

```js
const locks = { metar: false, taf: false, warning: false, lightning: false, radar: false };
```

동일 타입 작업이 실행 중이면 해당 주기는 스킵된다.

---

## 3. 캐싱 및 변경 감지

### 3.1 store 캐시 구조
`backend/src/store.js`:

```js
const cache = {
  metar: { hash: null, prev_data: null },
  taf: { hash: null, prev_data: null },
  warning: { hash: null, prev_data: null },
  lightning: { hash: null, prev_data: null }
};
```

`prev_data`는 두 가지 용도로 사용된다:
1. **변경 감지**: `shouldSave()`에서 이전 hash와 비교
2. **API 서빙**: `getCached(type)`을 통해 `server.js`가 메모리 우선 응답에 사용

### 3.2 getCached(type)
`server.js`의 `/api/metar|taf|warning|lightning` 응답 시 호출된다.

```js
function getCached(type) {
  return cache[type]?.prev_data ?? null;
}
```

- 반환값이 `null`이 아니면 메모리에서 즉시 응답
- `null`이면 디스크(`latest.json`) 폴백 (cold start 시에만 해당)
- `server.js`와 `backend/src/index.js`는 같은 Node.js 프로세스 내에서 동일한 `store` 모듈 인스턴스를 공유하므로, 스케줄러가 `updateCache()`로 갱신하면 서버 측에서 즉시 반영된다.

### 3.3 canonical hash (구 3.2)
저장 여부 판단은 `canonicalHash(data)`로 결정한다.

해시 계산 시 제외 필드:
- `type`
- `fetched_at`
- `_stale`

즉, 메타 필드 변화만 있을 때는 변경으로 보지 않는다.

### 3.5 unchanged 동작
`store.save(type, data)`에서 hash 동일 시:
- 새 타임스탬프 파일은 생성하지 않음
- 기존 `latest.json`의 `fetched_at`만 갱신

---

## 4. 부분 실패 복구

### 4.1 METAR/TAF
`metar-processor.js`, `taf-processor.js`:
- 공항 단위 호출 중 예외 발생 공항을 `failedAirports`에 기록
- `store.mergeWithPrevious(result, type, failedAirports)`로 이전값 복구 시도
- 복구된 공항에는 `_stale: true` 부여

주의:
- 현재 구현은 복구 대상에 `prevAirport.header.icao`가 있어야 복구한다.
- fetch 예외가 아닌 "파싱 결과 null"은 `failedAirports`에 자동 포함되지 않는다.

### 4.2 WARNING
경보는 단일 API 응답(공항 전체)을 파싱한다.
- 공항별 부분 실패 복구 루틴은 사용하지 않는다.
- 저장은 `store.save("warning", parsed)`로 처리된다.

### 4.3 LIGHTNING
낙뢰는 processor 내부에서 공항별 실패를 자체 복구한다.
- 이전 낙뢰 데이터가 있으면 해당 공항에 `_stale: true` 적용
- 없으면 빈 payload 생성
- 이후 `store.save("lightning", result)` 수행

### 4.4 RADAR
레이더는 `store.js`를 사용하지 않고 `radar-processor.js`가 별도 관리:
- PNG 유효성 검사 후 저장
- `backend/data/radar/latest.json` 직접 갱신
- 이미지 순환 삭제(`max_images`)

---

## 5. 파일 관리

### 5.1 저장 경로
기본 경로는 `config.storage.base_path` (기본: `backend/data`).

```text
backend/data/
  metar/
    latest.json
    METAR_YYYYMMDDTHHMMSSmmmZ.json
  taf/
    latest.json
    TAF_YYYYMMDDTHHMMSSmmmZ.json
  warning/
    latest.json
    WARNINGS_YYYYMMDDTHHMMSSmmmZ.json
  lightning/
    latest.json
    LIGHTNING_YYYYMMDDTHHMMSSmmmZ.json
  radar/
    latest.json
    RDR_YYYYMMDDHHmm.png
```

### 5.2 순환 정책
- `store.rotateFiles()`: JSON 파일(단, `latest.json` 제외) 최신 N개 유지
- N 기본값: `config.storage.max_files_per_category` (기본 10)
- 레이더 이미지는 `radar-processor.js`에서 별도 순환(`config.radar.max_images`)

---

## 6. 실행 흐름

### 6.1 초기화
`backend/src/index.js::main()`:
1. `store.ensureDirectories(base_path)`
2. `store.initFromFiles(base_path)`로 `latest.json` 기반 캐시 복원
3. cron 스케줄 등록

### 6.2 METAR/TAF 대표 흐름
1. 공항 순회 호출
2. 파싱 성공 건만 `result.airports`에 반영
3. 실패 공항 복구 시도(`mergeWithPrevious`)
4. `store.save(type, result)`로 hash 비교/저장

### 6.3 WARNING 대표 흐름
1. 경보 API 1회 호출
2. 전체 파싱 결과 생성
3. `store.save("warning", parsed)`

### 6.4 LIGHTNING 대표 흐름
1. 공항별 낙뢰 API 호출
2. 실패 공항은 이전값 또는 빈값으로 보정
3. `store.save("lightning", result)`

### 6.5 RADAR 대표 흐름
1. 후보 시각들에 대해 이미지 다운로드 시도
2. 유효 PNG 저장
3. 이미지 순환 + `latest.json` 갱신

---

## 7. 설정 포인트

### 7.1 스케줄
`config.schedule`:
- `metar_interval`
- `taf_interval`
- `warning_interval`
- `lightning_interval`
- `radar_interval`

### 7.2 저장
`config.storage`:
- `base_path`
- `max_files_per_category`

### 7.3 API 안정성
`config.api`:
- `timeout_ms`
- `max_retries`

---

## 8. 검증 체크리스트

| # | 테스트 케이스 | 기대 결과 |
|---|---|---|
| 1 | 초기 기동 | 디렉토리 생성 + 캐시 복원 |
| 2 | hash 동일 저장 | 타임스탬프 파일 미생성, latest의 fetched_at 갱신 |
| 3 | hash 변경 저장 | 새 타임스탬프 파일 + latest 갱신 |
| 4 | METAR/TAF 일부 공항 fetch 실패 | 이전값 복구 + `_stale: true` |
| 5 | WARNING 변경 없음 | 파일 추가 생성 없음 |
| 6 | LIGHTNING 일부 공항 실패 | 이전값 또는 빈 payload로 보정 |
| 7 | JSON 파일 순환 | 최신 N개만 유지, latest 제외 |
| 8 | 락 동작 | 동일 타입 중복 실행 스킵 |
| 9 | 재시작 | latest 기반으로 hash/prev_data 정상 복원 |
| 10 | RADAR 수집 | PNG/metadata 최신화 및 이미지 순환 |
| 11 | API 요청 (정상 운영 중) | `[CACHE HIT]` — 디스크 I/O 없이 메모리 응답 |
| 12 | API 요청 (cold start) | `[DISK READ]` — latest.json 폴백 후 이후 요청은 캐시 |

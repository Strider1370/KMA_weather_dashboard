# 스케줄러 및 캐싱 설계문서

## 1. 개요

### 1.1 목적
TAF, METAR, 공항경보 데이터를 주기적으로 API에서 수집하고, 변경이 있을 때만 JSON 파일로 저장하는 통합 스케줄링 시스템을 정의한다.

### 1.2 환경
- 런타임: Node.js
- 저장: 로컬 파일시스템
- 스케줄링: 프로세스 내 타이머 (node-cron 등)

---

## 2. 폴링 주기 설계

### 2.1 데이터별 특성 및 권장 주기

| 데이터 | 실제 갱신 주기 | 폴링 주기 | 근거 |
|--------|--------------|----------|------|
| **METAR** | 매시 정시 (일부 특별관측 수시) | **10분** | 정시 관측 + SPECI 대응. 너무 짧으면 API 부하, 너무 길면 SPECI 놓침 |
| **TAF** | 6시간 (00/06/12/18Z), AMD 수시 | **30분** | 유효기간이 길어 빈번한 조회 불필요. AMD 대응으로 30분 |
| **경보** | 비정기 (발령/해제 시) | **5분** | 안전 관련이므로 짧게. 발령 즉시 감지 필요 |

### 2.2 스케줄 타임라인 예시 (1시간)

```
분  00    05    10    15    20    25    30    35    40    45    50    55
    │     │     │           │           │     │     │           │
    M+W   W     M     W           W     M+T+W W     M     W
    
M = METAR (10분마다)
T = TAF (30분마다)
W = 경보 Warning (5분마다)

00분: METAR + 경보
05분: 경보
10분: METAR
15분: 경보
20분: METAR
25분: 경보
30분: METAR + TAF + 경보
35분: 경보
40분: METAR
45분: 경보
50분: METAR
55분: 경보
```

### 2.3 주기 설정 구조

```javascript
const SCHEDULE_CONFIG = {
    metar: {
        interval_minutes: 10,
        description: "METAR 관측 데이터"
    },
    taf: {
        interval_minutes: 30,
        description: "TAF 예보 데이터"
    },
    warning: {
        interval_minutes: 5,
        description: "공항경보 데이터"
    }
};
```

주기는 설정값으로 관리하여, 운영 중 조정 가능하게 한다.

---

## 3. 캐싱 및 변경 감지

### 3.1 변경 감지 방식

API 응답을 받은 후, 이전 저장 데이터와 비교하여 변경이 있을 때만 새 파일을 저장한다.

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────┐
│ API 호출 │ ──→ │  파싱    │ ──→ │ 부분실패복구  │ ──→ │ 비교     │ ──→ │ 저장     │
│          │     │          │     │ (이전값 채움) │     │ (변경?)  │     │ (변경 시) │
└──────────┘     └──────────┘     └──────────────┘     └──────────┘     └──────────┘
                                                             │
                                                             ▼ 동일하면
                                                        저장 안 함 (스킵)
```

### 3.2 해시 대상: canonical 데이터 (메타 필드 제외)

통합 JSON에는 `fetched_at`, `type` 같은 메타 필드가 포함되는데, 이 값은 매 폴링마다 바뀐다. 해시 대상에 포함하면 데이터가 동일해도 매번 "변경됨"으로 판정된다.

**해시 대상에서 메타 필드를 제외한다.**

```
함수 canonical_hash(result):
    // 메타 필드 제외, airports 데이터만 해시
    canonical = result.airports    // { "RKSI": {...}, "RKPC": {...} }
    return hash(JSON.stringify(canonical, sorted_keys))
```

| 해시 포함 | 해시 제외 |
|----------|----------|
| `airports` 내부 전체 | `type` |
| | `fetched_at` |

### 3.3 비교 키 (로그/모니터링용)

해시는 "변경 여부"만 알려주고 "무엇이 바뀌었는지"는 알려주지 않는다. 로그에 변경 원인을 표시하기 위해, 데이터별 비교 키를 보조적으로 사용한다.

| 데이터 | 비교 키 | 로그 용도 |
|--------|---------|----------|
| **METAR** | 각 공항의 `observation_time` | "RKPC: 관측시각 09Z → 10Z" |
| **TAF** | 각 공항의 `issued` + `valid_start` | "RKSI: AMD 발행" |
| **경보** | 경보 건수, 공항별 wrng_type 목록 | "RKNY: 강풍경보 추가" |

이 비교 키는 **저장 여부 판단에 사용하지 않는다.** 저장 여부는 canonical hash로만 판단한다.

### 3.4 비교 알고리즘

```
함수 should_save(data_type, new_data, cache):

    if cache에 이전 데이터 없음:
        return true   // 최초 실행

    new_hash = canonical_hash(new_data)
    
    if new_hash == cache.hash:
        return false  // 변경 없음
    
    // 변경 있음 — 로그에 변경 내역 기록 (선택)
    log_changes(data_type, new_data, cache.prev_data)
    
    return true
```

### 3.5 부분 실패 복구 (이전 캐시 병합)

일부 공항의 API 호출이 실패하면, 통합 JSON에서 해당 공항이 빠진다. 이 경우 해시가 바뀌어 불필요한 저장이 발생한다.

**실패 공항은 이전 저장 데이터에서 가져와 채운다.**

```
함수 merge_with_previous(new_result, prev_result, failed_airports):

    for each airport in failed_airports:
        if prev_result.airports[airport] 존재:
            new_result.airports[airport] = prev_result.airports[airport]
            new_result.airports[airport]._stale = true   // 이전 데이터임을 표시
            log_warning("{airport}: API 실패, 이전 데이터 유지")
    
    return new_result
```

| 상황 | 동작 |
|------|------|
| 공항 A 실패, B/C 성공 | A는 이전값, B/C는 새값 → 해시 비교 |
| 전체 실패 | 전부 이전값 → 해시 동일 → 저장 안 함 |
| A 실패 + B 변경 | A 이전값 + B 새값 → 해시 변경 → 저장 |

`_stale` 플래그는 프론트엔드에서 "이 데이터는 최신이 아님"을 표시하는 데 활용할 수 있다. 해시 계산 시에는 `_stale` 플래그를 제외한다.

### 3.6 메모리 캐시 구조

```javascript
const cache = {
    metar: {
        hash: "a1b2c3d4...",           // canonical hash
        prev_data: { airports: {...} }  // 이전 저장 데이터 (부분 실패 복구용)
    },
    taf: {
        hash: "e5f6g7h8...",
        prev_data: { airports: {...} }
    },
    warning: {
        hash: "i9j0k1l2...",
        prev_data: { airports: {...} }
    }
};
```

---

## 4. 파일 관리

### 4.1 저장 경로 구조

```
data/
  ├ metar/
  │   ├ latest.json                        ← 항상 최신
  │   ├ METAR_20260208T1000Z.json
  │   ├ METAR_20260208T1010Z.json
  │   └ ... (최신 10개)
  │
  ├ taf/
  │   ├ latest.json
  │   ├ TAF_20260208T1000Z.json
  │   ├ TAF_20260208T1030Z.json
  │   └ ... (최신 10개)
  │
  └ warning/
      ├ latest.json
      ├ WARNINGS_20260208T1200Z.json
      └ ... (최신 10개)
```

각 카테고리별 디렉토리 1개씩, 공항별 하위 디렉토리 없음. 파일 하나에 전체 공항 데이터가 포함된다.

### 4.2 파일명 규칙

| 데이터 | 파일명 | 타임스탬프 기준 |
|--------|--------|---------------|
| METAR | `METAR_{fetched_at}.json` | 조회 시점 |
| TAF | `TAF_{fetched_at}.json` | 조회 시점 |
| 경보 | `WARNINGS_{fetched_at}.json` | 조회 시점 |

### 4.3 파일 순환 (Rotation)

각 카테고리별 최신 10개 파일만 유지한다. latest.json은 순환 대상에서 제외한다.

```
함수 rotate_files(directory, max_count = 10):

    files = directory 내 JSON 파일 목록 (latest.json 제외)
    files를 파일명 기준 정렬 (타임스탬프 포함이므로 사전순 = 시간순)

    if files.length > max_count:
        삭제할 파일 = files[0 .. (files.length - max_count - 1)]
        삭제할 파일들 삭제
```

### 4.4 latest.json 갱신

새 파일 저장 시 latest.json을 최신 파일의 복사본으로 갱신한다.

```
함수 save_and_update_latest(directory, filename, data):
    
    // 1. 타임스탬프 파일 저장
    write_json("{directory}/{filename}", data)
    
    // 2. latest.json 덮어쓰기
    write_json("{directory}/latest.json", data)
    
    // 3. 순환
    rotate_files(directory, 10)
```

---

## 5. 에러 처리

### 5.1 API 호출 실패

```
함수 api_call_with_retry(url, params, max_retries = 3):

    for attempt = 1 to max_retries:
        try:
            response = http_get(url, params)
            
            if response.header.resultCode ≠ "00":
                log_warning("API 응답 오류: {resultMsg}")
                return null
            
            return response
            
        catch (network_error):
            log_warning("API 호출 실패 (시도 {attempt}/{max_retries}): {error}")
            if attempt < max_retries:
                wait(attempt * 2초)  // 지수 백오프
    
    log_error("API 호출 최종 실패: {url}")
    return null  // 실패 시 이전 캐시 데이터 유지
```

### 5.2 파싱 실패

```
파싱 중 에러 발생 시:
  - 해당 건만 스킵, 다른 공항/데이터는 정상 처리
  - 에러 로그 기록
  - 이전 캐시 데이터 유지 (잘못된 데이터로 덮어쓰지 않음)
```

### 5.3 파일 저장 실패

```
저장 실패 시:
  - 에러 로그 기록
  - 메모리 캐시는 갱신하지 않음 (다음 주기에 재시도)
```

---

## 6. 통합 실행 흐름

### 6.1 실행 락 (Overrun 방지)

동일 타입의 작업이 이전 실행이 끝나기 전에 다시 트리거되면 스킵한다.

```javascript
const locks = {
    metar: false,
    taf: false,
    warning: false
};

async function run_with_lock(type, job) {
    if (locks[type]) {
        log_warning(`${type}: 이전 작업 실행 중, 이번 주기 스킵`);
        return;
    }
    locks[type] = true;
    try {
        await job();
    } finally {
        locks[type] = false;
    }
}
```

### 6.2 메인 스케줄러

```javascript
// 초기화
async function initialize() {
    ensure_directories()     // data/metar, data/taf, data/warning 생성
    load_cache_from_files()  // 기존 파일에서 캐시 복원
}

// 스케줄 등록
function start_scheduler() {
    // METAR: 10분마다 (전체 공항 일괄)
    schedule("*/10 * * * *", () => run_with_lock("metar", process_all_metar))

    // TAF: 30분마다 (전체 공항 일괄)
    schedule("*/30 * * * *", () => run_with_lock("taf", process_all_taf))

    // 경보: 5분마다 (API 1회 호출로 전체)
    schedule("*/5 * * * *", () => run_with_lock("warning", process_warnings))
}
```

### 6.3 각 프로세서

```
함수 process_all_metar():
    result = {
        type: "METAR",
        fetched_at: now(),
        airports: {}
    }
    failed_airports = []

    for each airport in AIRPORT_LIST:
        xml = api_call_metar(airport)
        if xml == null:
            failed_airports.push(airport)
            continue

        metar = metar_parser.process(xml)
        if metar == null:
            failed_airports.push(airport)
            continue

        result.airports[airport] = metar

    // 부분 실패 복구: 실패 공항은 이전 데이터로 채움
    if failed_airports.length > 0 AND cache.metar.prev_data 존재:
        merge_with_previous(result, cache.metar.prev_data, failed_airports)

    // canonical hash로 비교 (fetched_at 제외)
    new_hash = canonical_hash(result)
    if new_hash == cache.metar.hash:
        return                                // 변경 없음, 스킵

    save_and_update_latest("data/metar/", "METAR_{timestamp}.json", result)
    cache.metar = { hash: new_hash, prev_data: result }
    log_info("METAR 갱신: {성공}개 공항, {실패}개 실패")


함수 process_all_taf():
    result = {
        type: "TAF",
        fetched_at: now(),
        airports: {}
    }
    failed_airports = []

    for each airport in AIRPORT_LIST:
        xml = api_call_taf(airport)
        if xml == null:
            failed_airports.push(airport)
            continue

        taf = taf_parser.process(xml)
        if taf == null:
            failed_airports.push(airport)
            continue

        result.airports[airport] = taf

    // 부분 실패 복구
    if failed_airports.length > 0 AND cache.taf.prev_data 존재:
        merge_with_previous(result, cache.taf.prev_data, failed_airports)

    new_hash = canonical_hash(result)
    if new_hash == cache.taf.hash:
        return

    save_and_update_latest("data/taf/", "TAF_{timestamp}.json", result)
    cache.taf = { hash: new_hash, prev_data: result }
    log_info("TAF 갱신: {성공}개 공항, {실패}개 실패")


함수 process_warnings():
    xml = api_call_warnings()
    if xml == null: return

    warnings = warning_parser.process(xml)
    if warnings == null: return

    new_hash = canonical_hash(warnings)
    if new_hash == cache.warning.hash:
        return

    save_and_update_latest("data/warning/", "WARNINGS_{timestamp}.json", warnings)
    cache.warning = { hash: new_hash, prev_data: warnings }
    log_info("경보 갱신: {total_count}건")
```

---

## 7. 설정 파일 구조

모든 설정을 하나의 config 파일로 관리한다.

```javascript
// config.js
module.exports = {
    // API 설정
    api: {
        base_url: "",           // API 베이스 URL (제공 예정)
        service_key: "",        // API 인증키 (제공 예정)
        timeout_ms: 10000,      // 요청 타임아웃
        max_retries: 3          // 재시도 횟수
    },

    // 대상 공항 목록
    airports: [
        // 제공 예정
    ],

    // 스케줄링
    schedule: {
        metar_interval: "*/10 * * * *",     // 10분
        taf_interval: "*/30 * * * *",       // 30분
        warning_interval: "*/5 * * * *"     // 5분
    },

    // 파일 관리
    storage: {
        base_path: "./data",
        max_files_per_category: 10   // 최신 N개 보존
    }
};
```

---

## 8. 모듈 구조 (최종)

```
project/
  ├ config.js              ← 설정 (API URL, 공항 목록, 주기 등)
  ├ main.js                ← 스케줄러 초기화 및 실행
  ├ taf_parser.js          ← TAF XML 파싱 → JSON
  ├ metar_parser.js        ← METAR XML 파싱 → JSON
  ├ warning_parser.js      ← 경보 XML 파싱 → JSON
  ├ cache_manager.js       ← 변경 감지, 메모리 캐시 관리
  ├ file_manager.js        ← 파일 저장, 순환, latest 갱신
  └ data/                  ← JSON 출력 디렉토리
      ├ metar/{ICAO}/
      ├ taf/{ICAO}/
      └ warning/
```

---

## 9. 검증 체크리스트

| # | 테스트 케이스 | 검증 포인트 |
|---|-------------|------------|
| 1 | 최초 실행 | 모든 데이터 정상 수집 및 저장 |
| 2 | METAR 변경 없음 | canonical hash 동일 → 파일 생성 안 함 |
| 3 | METAR 1개 공항 변경 | canonical hash 변경 → 새 통합 파일 생성 |
| 4 | fetched_at만 다름 | canonical hash에서 제외 → 파일 생성 안 함 |
| 5 | TAF 변경 없음 | canonical hash 동일 → 파일 생성 안 함 |
| 6 | TAF AMD 발행 | canonical hash 변경 → 새 통합 파일 생성 |
| 7 | 경보 변경 없음 | 해시 동일 → 파일 생성 안 함 |
| 8 | 경보 추가/해제 | 해시 변경 → 새 파일 생성 |
| 9 | 파일 순환 (11번째 저장) | 가장 오래된 파일 1개 삭제, 10개 유지 |
| 10 | latest.json 갱신 | 새 파일 저장 시 latest.json도 갱신 |
| 11 | latest.json 순환 제외 | rotate_files에서 latest.json 건너뜀 |
| 12 | 부분 실패: 1개 공항 API 실패 | 이전 데이터로 채움, _stale=true 표시 |
| 13 | 부분 실패: 이전 데이터 복구 후 해시 비교 | 복구된 데이터 포함하여 해시 비교 |
| 14 | 전체 API 실패 | 전부 이전값 → 해시 동일 → 저장 안 함 |
| 15 | 실행 락: 이전 작업 진행 중 | 다음 트리거 스킵, 경고 로그 |
| 16 | 실행 락: 타입별 독립 | METAR 실행 중에 경보는 정상 실행 |
| 17 | 파싱 실패 | 해당 공항 실패 처리, 이전 데이터로 복구 |
| 18 | 프로세스 재시작 | 기존 파일에서 캐시 복원, 정상 재개 |
| 19 | 통합 JSON 구조 | airports 키에 전체 공항 포함 확인 |
| 20 | _stale 플래그 해시 제외 | _stale만 다른 경우 해시 동일 판정 |

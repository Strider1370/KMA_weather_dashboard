# 공항경보 파싱 알고리즘 설계문서

## 1. 개요

### 1.1 목적
KMA API로부터 공항경보(Airport Warning) XML을 수신하여, 현재 유효한 경보를 구조화된 JSON으로 변환한다.

### 1.2 특성
- TAF/METAR과 달리 복잡한 파싱이 불필요하다. API 응답의 필드가 이미 구조화되어 있다.
- 1회 API 호출에 복수 공항의 경보가 포함될 수 있다.
- 출력은 전체 공항 통합 JSON 1개이다.

---

## 2. 데이터 모델

### 2.1 경보 유형 코드 매핑

| wrngType 코드 | 경보 유형 | 영문 키 |
|---------------|----------|---------|
| `00` | 급변풍경보 | `WIND_SHEAR` |
| `1` | 저시정경보 | `LOW_VISIBILITY` |
| `2` | 강풍경보 | `STRONG_WIND` |
| `3` | 호우경보 | `HEAVY_RAIN` |
| `4` | 구름고도경보 | `LOW_CEILING` |
| `5` | 뇌우경보 | `THUNDERSTORM` |
| `7` | 태풍경보 | `TYPHOON` |
| `8` | 대설경보 | `HEAVY_SNOW` |
| `13` | 황사경보 | `YELLOW_DUST` |

### 2.2 경보 객체 (Warning)

```
Warning = {
    icao          : String,       // 공항 ICAO 코드
    airport_name  : String,       // 공항명 (한글)
    issued        : DateTime,     // 발표 시각 (tm 필드)
    wrng_type     : String,       // 경보 유형 코드 (원본)
    wrng_type_key : String,       // 경보 유형 영문 키
    wrng_type_name: String,       // 경보 유형 한글명
    valid_start   : DateTime,     // 유효 시작
    valid_end     : DateTime,     // 유효 종료
    raw_message   : String        // wrngMsg 원문 (참조용)
}
```

---

## 3. XML 파싱 규칙

### 3.1 XML 소스 구조

```
response
  └ body
    └ items
      └ item (복수)
        ├ icaoCode        → icao
        ├ airportName     → airport_name
        ├ tm              → issued (YYYYMMDDHHmm 형식)
        ├ wrngType        → wrng_type, wrng_type_key, wrng_type_name
        ├ validTm1        → valid_start (YYYYMMDDHHmm 형식)
        ├ validTm2        → valid_end (YYYYMMDDHHmm 형식)
        └ wrngMsg         → raw_message
```

### 3.2 시간 변환

API의 시간 필드는 `YYYYMMDDHHmm` 형식(예: `202602081137`)이다.

```
변환: "202602081137" → "2026-02-08T11:37:00Z" (ISO 8601)

규칙:
  YYYY = 앞 4자리
  MM   = 5~6자리
  DD   = 7~8자리
  HH   = 9~10자리
  mm   = 11~12자리
```

### 3.3 경보 유형 변환

```
함수 resolveWarningType(code):
    매핑 테이블 조회 (2.1절)
    
    return {
        wrng_type: code,                    // 원본 코드 보존
        wrng_type_key: 매핑된 영문 키,       // 예: "WIND_SHEAR"
        wrng_type_name: 매핑된 한글명        // 예: "급변풍경보"
    }
    
    매핑 테이블에 없는 코드:
        wrng_type_key: "UNKNOWN"
        wrng_type_name: "Unknown Warning"
```

---

## 4. 파싱 파이프라인

```
┌──────────────────────────────────────────────┐
│ 1. API 응답 XML 수신                         │
│                                              │
│ 2. response > body > items > item 순회       │
│    (복수 공항, 복수 경보)                     │
│                                              │
│ 3. 각 item에서 필드 추출                     │
│    - icaoCode, airportName                   │
│    - tm → ISO 8601 변환                      │
│    - wrngType → 유형 매핑                    │
│    - validTm1, validTm2 → ISO 8601 변환      │
│    - wrngMsg → 원문 보존                     │
│                                              │
│ 4. Warning 객체 생성                         │
│                                              │
│ 5. 공항별 그룹핑                             │
│                                              │
│ 6. JSON 출력                                 │
└──────────────────────────────────────────────┘
```

---

## 5. JSON 출력 스키마

### 5.1 파일명 규칙

```
WARNINGS_{YYYYMMDDTHHMMSSmmmZ}.json

예시: WARNINGS_20260210T135500880Z.json
      (조회 시점 기준, 다른 데이터와 동일한 타임스탬프 형식)
```

### 5.2 JSON 구조

```json
{
  "type": "AIRPORT_WARNINGS",
  "fetched_at": "2026-02-08T12:00:00Z",
  "total_count": 5,
  "airports": {
    "RKPC": {
      "airport_name": "제주공항",
      "warnings": [
        {
          "issued": "2026-02-08T11:37:00Z",
          "wrng_type": "00",
          "wrng_type_key": "WIND_SHEAR",
          "wrng_type_name": "급변풍경보",
          "valid_start": "2026-02-08T12:00:00Z",
          "valid_end": "2026-02-08T17:00:00Z",
          "raw_message": "RKPC WS WRNG 2 081137 VALID 081200/081700 EXTENDED WS WRNG 2 080000/081200="
        },
        {
          "issued": "2026-02-08T11:35:00Z",
          "wrng_type": "00",
          "wrng_type_key": "WIND_SHEAR",
          "wrng_type_name": "급변풍경보",
          "valid_start": "2026-02-08T12:00:00Z",
          "valid_end": "2026-02-08T17:00:00Z",
          "raw_message": "RKPC WS WRNG 1 081135 VALID 081200/081700 EXTENDED WS WRNG 1 080000/081200="
        }
      ]
    },
    "RKNY": {
      "airport_name": "양양공항",
      "warnings": [
        {
          "issued": "2026-02-08T08:20:00Z",
          "wrng_type": "00",
          "wrng_type_key": "WIND_SHEAR",
          "wrng_type_name": "급변풍경보",
          "valid_start": "2026-02-08T11:00:00Z",
          "valid_end": "2026-02-09T18:00:00Z",
          "raw_message": "RKNY WS WRNG 2 080820 VALID 081100/091800 WS IN CLIMB-OUT FCST="
        },
        {
          "issued": "2026-02-08T08:19:00Z",
          "wrng_type": "00",
          "wrng_type_key": "WIND_SHEAR",
          "wrng_type_name": "급변풍경보",
          "valid_start": "2026-02-08T11:00:00Z",
          "valid_end": "2026-02-09T18:00:00Z",
          "raw_message": "RKNY WS WRNG 1 080819 VALID 081100/091800 WS IN APCH FCST="
        },
        {
          "issued": "2026-02-08T08:18:00Z",
          "wrng_type": "2",
          "wrng_type_key": "STRONG_WIND",
          "wrng_type_name": "강풍경보",
          "valid_start": "2026-02-08T11:00:00Z",
          "valid_end": "2026-02-09T18:00:00Z",
          "raw_message": "RKNY AD WRNG 1 VALID 081100/091800 SFC WSPD 25KT MAX 35 FCST="
        }
      ]
    }
  }
}
```

### 5.3 필드 상세

#### 최상위

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | String | 항상 `"AIRPORT_WARNINGS"` |
| `fetched_at` | DateTime | API 조회 시점 (ISO 8601) |
| `total_count` | Integer | 전체 경보 건수 |
| `airports` | Object | ICAO 코드를 키로 하는 공항별 그룹 |

#### 공항 그룹

| 필드 | 타입 | 설명 |
|------|------|------|
| `airport_name` | String | 공항명 (한글) |
| `warnings` | Array | 해당 공항의 경보 목록 (발표 시각 오름차순) |

#### 개별 경보

| 필드 | 타입 | 설명 |
|------|------|------|
| `issued` | DateTime | 발표 시각 (ISO 8601) |
| `wrng_type` | String | 경보 유형 코드 (원본) |
| `wrng_type_key` | String | 경보 유형 영문 키 |
| `wrng_type_name` | String | 경보 유형 한글명 |
| `valid_start` | DateTime | 유효 시작 (ISO 8601) |
| `valid_end` | DateTime | 유효 종료 (ISO 8601) |
| `raw_message` | String | wrngMsg 원문 |

---

## 6. 모듈 구조

기존 파일 구조에 추가:

```
KMA_weather_dashboard/
  ├ backend/src/parsers/warning-parser.js
  ├ backend/src/processors/warning-processor.js
  ├ backend/src/store.js
  └ backend/src/index.js
```

### 6.1 warning 처리 파이프라인

스케줄러 설계문서(Scheduler_Cache_Design.md)에 전체 실행 흐름이 정의되어 있다. 경보 관련 부분만 발췌:

```
함수 warningProcessor.process():
    xml = apiClient.fetch("warning")
    parsed = warningParser.parse(xml)
    saveResult = store.save("warning", parsed)
    return { saved, filePath, airports }
```

경보는 단일 API 응답을 파싱해 바로 저장하며, 변경 감지(canonical hash)와 latest.json 갱신/순환 관리는 `store.save`가 담당한다.

---

## 7. 경보와 TAF/METAR 연계

경보 JSON의 공항별 키(ICAO 코드)는 TAF/METAR JSON의 header.icao와 동일하다. 프론트엔드에서 특정 공항의 TAF 타임라인을 표시할 때, 같은 ICAO 코드로 해당 공항의 유효 경보를 조회하여 오버레이할 수 있다.

```
예시: RKPC 화면
  TAF 타임라인:  0806 ~ 0912 시간별 기상 상태
  경보 오버레이: 급변풍경보 0812 ~ 0817 (빨간색 바)
```

경보의 `valid_start`/`valid_end`와 TAF 타임라인의 시각을 비교하여, 해당 시간대에 유효한 경보를 표시한다.

---

## 8. 검증 체크리스트

| # | 테스트 케이스 | 검증 포인트 |
|---|-------------|------------|
| 1 | 샘플 XML 전체 파싱 | 5건 모두 정상 추출 |
| 2 | wrngType "00" | WIND_SHEAR / 급변풍경보 매핑 |
| 3 | wrngType "2" | STRONG_WIND / 강풍경보 매핑 |
| 4 | 미등록 wrngType | UNKNOWN / Unknown Warning |
| 5 | 시간 변환 | "202602081137" → "2026-02-08T11:37:00Z" |
| 6 | 공항별 그룹핑 | RKPC 2건, RKNY 3건 분리 |
| 7 | 경보 정렬 | 같은 공항 내 발표 시각 오름차순 |
| 8 | 빈 응답 (경보 없음) | airports: {}, total_count: 0 |
| 9 | wrngMsg 원문 보존 | 특수문자(=, /) 포함 정상 저장 |

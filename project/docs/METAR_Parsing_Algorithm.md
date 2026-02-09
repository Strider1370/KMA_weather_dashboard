# METAR 파싱 알고리즘 설계문서

## 1. 개요

### 1.1 목적
METAR(Meteorological Aerodrome Report) IWXXM XML을 입력받아, 관측 데이터를 구조화된 JSON으로 변환한다.

### 1.2 TAF 알고리즘과의 관계
본 문서는 「TAF 시간별 분해 알고리즘 설계문서」와 공통 요소를 공유한다.

| 요소 | 공유 여부 | 비고 |
|------|----------|------|
| WeatherPhenomenon 객체 (2.1절) | **공유** | 동일한 구조, 동일한 파싱 규칙 |
| 기상현상 파싱 규칙 (2.2절) | **공유** | URL 코드 추출 → 구조화 파싱 |
| 구름 파싱 (amount URL 추출, base) | **공유** | 동일한 URL 패턴, 동일한 변환 규칙 |
| 바람 변환 (방향/속도/돌풍 → 문자열) | **공유** | 동일한 포맷 규칙 |
| CAVOK 판별 및 정규화 | **공유** | cloudAndVisibilityOK 속성 |
| NSW 판별 | **공유** | nilReason 속성 |
| 시정 변환 | **공유** | 미터 단위 정수 |
| 시간별 분해 (State Machine) | TAF 전용 | METAR에 해당 없음 |
| BECMG/TEMPO/PROB 처리 | TAF 전용 | METAR에 해당 없음 |
| partial_merge | TAF 전용 | METAR에 해당 없음 |
| NSW 후처리 (BR 자동 부여) | TAF 전용 | METAR은 관측값이므로 자동 부여 불필요 |
| 기온/이슬점/QNH | METAR 전용 | TAF에 해당 없음 (TX/TN은 별개) |
| 윈드시어 | METAR 전용 | TAF에서는 범위 밖으로 제외됨 |

### 1.3 핵심 차이: METAR는 스냅샷

TAF는 예보 기간에 대한 상태 기계이지만, METAR는 **단일 관측 시점의 스냅샷**이다. 따라서:

- 시간별 분해 불필요
- 변화 그룹 처리 불필요
- partial_merge 불필요
- 파싱 → 정규화 → JSON 출력의 단순한 파이프라인

---

## 2. 데이터 모델

### 2.1 METAR 관측 객체

```
METARObservation = {
    icao              : String,                    // 공항 ICAO 코드
    airport_name      : String,                    // 공항명
    issue_time        : DateTime,                  // 발표 시각 (ISO 8601)
    observation_time  : DateTime,                  // 관측 시각 (ISO 8601)
    auto              : Boolean,                   // 자동 관측 여부
    wind              : WindData,                  // 바람
    visibility        : VisibilityData,            // 시정
    weather           : List[WeatherPhenomenon],   // 기상현상 (공유 객체)
    clouds            : List[CloudLayer],          // 구름 (공유 구조)
    temperature       : TemperatureData,           // 기온/이슬점
    qnh               : QNHData,                   // 기압
    wind_shear        : WindShearData | null,      // 윈드시어 (선택)
    cavok_flag        : Boolean,                   // CAVOK 여부
    nsc_flag          : Boolean                    // NSC 여부
}
```

### 2.2 하위 객체 정의

#### WindData

```
WindData = {
    raw       : String,     // 표시용 문자열 (예: "32013G25KT")
    direction : Integer,    // 풍향 (deg), 정온 시 0
    speed     : Integer,    // 풍속
    gust      : Integer | null,  // 돌풍 (없으면 null)
    unit      : String,     // 항상 "KT"
    variable  : Boolean     // VRB 여부
}
```

#### VisibilityData

```
VisibilityData = {
    value : Integer,    // 미터 단위
    cavok : Boolean     // CAVOK 여부
}
```

#### WeatherPhenomenon (TAF 공유)

```
WeatherPhenomenon = {
    raw        : String,
    intensity  : Enum { LIGHT, MODERATE, HEAVY, VICINITY } | null,
    descriptor : Enum { MI, BC, PR, DR, BL, SH, TS, FZ } | null,
    phenomena  : List[String]
}
```

파싱 규칙은 TAF 설계문서 2.2절과 완전히 동일하다.

#### CloudLayer (TAF 공유)

```
CloudLayer = {
    amount : String,     // FEW, SCT, BKN, OVC
    base   : Integer,    // ft (AGL)
    raw    : String      // 표시용 (예: "FEW018")
}
```

#### TemperatureData (METAR 고유)

```
TemperatureData = {
    air      : Integer,    // 기온 (°C)
    dewpoint : Integer     // 이슬점 (°C)
}
```

#### QNHData (METAR 고유)

```
QNHData = {
    value : Integer,    // 기압 값
    unit  : String      // "hPa"
}
```

#### WindShearData (METAR 고유)

```
WindShearData = {
    all_runways : Boolean,          // 전체 활주로 여부
    runways     : List[String] | null  // 특정 활주로 (all_runways=false일 때)
}
```

---

## 3. IWXXM XML 파싱 규칙

### 3.1 XML 소스 구조

KMA API 응답을 파싱한다. 1회 호출 = 1공항 = 1 METAR.

```
response
  └ body
    └ items
      └ item
        ├ icaoCode          (비어있을 수 있음)
        ├ airportName       (비어있을 수 있음)
        └ metarMsg
          └ iwxxm:METAR     ← 실제 파싱 대상
```

### 3.2 네임스페이스

TAF와 동일하다.

```
iwxxm  = "http://icao.int/iwxxm/2023-1"
gml    = "http://www.opengis.net/gml/3.2"
aixm   = "http://www.aixm.aero/schema/5.1.1"
xlink  = "http://www.w3.org/1999/xlink"
```

### 3.3 METAR 헤더 매핑

| 내부 모델 | XML 경로 | 추출 방법 |
|-----------|----------|----------|
| icao | `iwxxm:aerodrome > ... > aixm:locationIndicatorICAO` | 텍스트 (TAF와 동일 경로) |
| airport_name | 같은 경로 > `aixm:name` | 텍스트 |
| issue_time | `iwxxm:issueTime > gml:TimeInstant > gml:timePosition` | ISO 8601 |
| observation_time | `iwxxm:observationTime > gml:TimeInstant > gml:timePosition` | ISO 8601 |
| auto | `iwxxm:METAR` 속성 `automatedStation` | "true"/"false" → Boolean |

### 3.4 관측 블록 매핑

관측 데이터는 `iwxxm:observation > iwxxm:MeteorologicalAerodromeObservation` 내부에 있다.

#### 3.4.1 CAVOK 판별

```
XML 속성: cloudAndVisibilityOK="true" | "false"

cloudAndVisibilityOK == "true"
  → cavok_flag = true
  → visibility = { value: 9999, cavok: true }
  → weather = []
  → clouds = []
  → 하위의 visibility, presentWeather, cloud 노드 무시
```

TAF C.4.1절과 동일한 규칙.

#### 3.4.2 바람 (surfaceWind)

```
XML 경로: iwxxm:surfaceWind > iwxxm:AerodromeSurfaceWind

주의: TAF는 "AerodromeSurfaceWindForecast", METAR는 "AerodromeSurfaceWind"
      속성과 하위 요소는 동일.

추출:
  variableWindDirection: 속성 (true/false)
  meanWindDirection:     iwxxm:meanWindDirection (deg)
  meanWindSpeed:         iwxxm:meanWindSpeed ([kn_i])
  windGustSpeed:         iwxxm:windGustSpeed ([kn_i], 선택)

변환 규칙: TAF C.4.2절과 동일.
  direction=320, speed=13, gust=25 → "32013G25KT"
```

#### 3.4.3 시정 (visibility)

```
XML 경로: iwxxm:visibility > iwxxm:AerodromeHorizontalVisibility > iwxxm:prevailingVisibility

주의: TAF는 직접 "iwxxm:prevailingVisibility"
      METAR는 "iwxxm:visibility > iwxxm:AerodromeHorizontalVisibility" 래퍼 존재.

추출:
  값: 텍스트 (숫자), 단위: uom="m"

변환: TAF C.4.3절과 동일.
  "10000" → { value: 10000, cavok: false }
```

#### 3.4.4 기상현상 (presentWeather)

```
XML 경로: iwxxm:presentWeather (복수 가능)

주의: TAF는 "iwxxm:weather", METAR는 "iwxxm:presentWeather"
      xlink:href URL 패턴은 동일.

형태 1: 현상 있음
  <iwxxm:presentWeather xlink:href="http://codes.wmo.int/306/4678/-SHSN"/>
  → URL 마지막 세그먼트 추출: "-SHSN"
  → WeatherPhenomenon 파싱 (TAF 2.2절과 동일)

형태 2: 현상 없음 (nilReason)
  <iwxxm:presentWeather nilReason="...nothingOfOperationalSignificance"/>
  → weather = []

형태 3: 노드 없음
  → weather = []  (METAR에서는 관측이므로 "없음"을 의미)

복수 현상:
  <iwxxm:presentWeather xlink:href=".../+TSRA"/>
  <iwxxm:presentWeather xlink:href=".../BR"/>
  → weather = [parse("+TSRA"), parse("BR")]
```

**TAF와의 차이점**: TAF에서는 노드 없음 = `null` (언급 없음, 기존값 유지)이지만, METAR에서는 노드 없음 = `[]` (관측 시 현상 없음)이다. METAR는 스냅샷이므로 "언급 없음"이라는 개념이 없다.

#### 3.4.5 구름 (cloud)

```
XML 경로: iwxxm:cloud > iwxxm:AerodromeCloud > iwxxm:layer (복수)

주의: TAF는 "iwxxm:AerodromeCloudForecast", METAR는 "iwxxm:AerodromeCloud"
      layer 내부 구조는 동일.

각 layer:
  amount: xlink:href URL 마지막 세그먼트 (FEW, SCT, BKN, OVC)
  base:   텍스트 ([ft_i])

변환: TAF C.4.5절과 동일.
  amount=FEW, base=1800 → { amount: "FEW", base: 1800, raw: "FEW018" }
  amount=BKN, base=2500 → { amount: "BKN", base: 2500, raw: "BKN025" }

NSC 판별: TAF와 동일 (cloud 노드에 nilReason 속성).
```

#### 3.4.6 기온 및 이슬점 (METAR 고유)

```
XML 경로:
  iwxxm:airTemperature        (속성 uom="Cel")
  iwxxm:dewpointTemperature   (속성 uom="Cel")

추출:
  값: 텍스트 → 정수 변환 (음수 가능, XML에서 "-5" 형태)

예시:
  airTemperature=1, dewpointTemperature=-5
  → temperature: { air: 1, dewpoint: -5 }
```

#### 3.4.7 QNH (METAR 고유)

```
XML 경로: iwxxm:qnh (속성 uom="hPa")

추출:
  값: 텍스트 → 정수 변환

예시:
  qnh=1031, uom=hPa
  → qnh: { value: 1031, unit: "hPa" }
```

#### 3.4.8 윈드시어 (METAR 고유)

```
XML 경로: iwxxm:AerodromeWindShear

추출:
  allRunways: 속성 "allRunways" ("true"/"false")

변환:
  allRunways="true"
  → wind_shear: { all_runways: true, runways: null }

  특정 활주로만 해당 시 (샘플에는 없으나 표준에 존재):
  → wind_shear: { all_runways: false, runways: ["RWY07L", "RWY25R"] }

  노드 없음:
  → wind_shear: null
```

### 3.5 XML 요소 경로 비교표 (TAF vs METAR)

| 요소 | TAF XML 경로 | METAR XML 경로 |
|------|-------------|---------------|
| 루트 | `iwxxm:TAF` | `iwxxm:METAR` |
| 래퍼 | `tafMsg` | `metarMsg` |
| 관측/예보 블록 | `iwxxm:baseForecast > MeteorologicalAerodromeForecast` | `iwxxm:observation > MeteorologicalAerodromeObservation` |
| 바람 노드 | `AerodromeSurfaceWindForecast` | `AerodromeSurfaceWind` |
| 시정 | 직접 `iwxxm:prevailingVisibility` | `iwxxm:visibility > AerodromeHorizontalVisibility > prevailingVisibility` |
| 기상현상 | `iwxxm:weather` | `iwxxm:presentWeather` |
| 구름 컨테이너 | `AerodromeCloudForecast` | `AerodromeCloud` |
| CAVOK | `cloudAndVisibilityOK` 속성 | `cloudAndVisibilityOK` 속성 |
| amount/base URL | 동일 | 동일 |
| 기온 | `iwxxm:temperature > AerodromeAirTemperatureForecast` (TX/TN) | `iwxxm:airTemperature` / `iwxxm:dewpointTemperature` |
| QNH | 해당 없음 | `iwxxm:qnh` |
| 윈드시어 | 해당 없음 | `iwxxm:AerodromeWindShear` |

---

## 4. 파싱 파이프라인

METAR는 상태 기계가 불필요하므로 파이프라인이 단순하다.

```
┌──────────────────────────────────────────────────┐
│ 1. API 응답 XML 수신                             │
│                                                  │
│ 2. response > body > items > item > metarMsg     │
│    > iwxxm:METAR 노드 탐색                       │
│                                                  │
│ 3. 헤더 추출 (3.3절)                             │
│    - icao, airport_name, issue_time,             │
│      observation_time, auto                      │
│                                                  │
│ 4. 관측 블록 추출 (3.4절)                        │
│    - CAVOK 판별                                  │
│    - wind, vis, presentWeather, cloud            │
│    - temperature, dewpoint, qnh, wind_shear      │
│                                                  │
│ 5. 정규화                                        │
│    - CAVOK → vis=9999, wx=[], clouds=[]          │
│    - NSC → clouds=[]                             │
│    - presentWeather nilReason → wx=[]            │
│                                                  │
│ 6. 기상현상 구조화 파싱                          │
│    - URL에서 추출한 코드 → WeatherPhenomenon     │
│    - TAF 2.2절과 동일한 파싱 규칙                │
│                                                  │
│ 7. JSON 출력 생성                                │
└──────────────────────────────────────────────────┘
```

**TAF와 다른 점**: 5단계에서 NSW 후처리(BR 자동 부여)를 수행하지 않는다. METAR는 실제 관측값이므로, 관측관이 이미 정확한 기상현상을 보고했기 때문이다.

---

## 5. JSON 출력 스키마

### 5.1 파일명 규칙

```
METAR_{fetched_at}.json

예시: METAR_20260208T1010Z.json
      (전체 공항 통합, 조회 시점 기준)
```

### 5.2 JSON 구조

전체 공항의 METAR를 하나의 JSON에 통합한다. ICAO 코드를 키로 한다.

```json
{
  "type": "METAR",
  "fetched_at": "2026-02-08T10:10:00Z",
  "airports": {
    "RKPC": {
      "header": {
        "icao": "RKPC",
        "airport_name": "JEJU INTERNATIONAL AIRPORT",
        "issue_time": "2026-02-08T10:00:00Z",
        "observation_time": "2026-02-08T10:00:00Z",
        "automated": false
      },
      "observation": {
        "wind": {
          "raw": "32013G25KT",
          "direction": 320,
          "speed": 13,
          "gust": 25,
          "unit": "KT",
          "variable": false
        },
        "visibility": {
          "value": 10000,
          "cavok": false
        },
        "weather": [
          {
            "raw": "-SHSN",
            "intensity": "LIGHT",
            "descriptor": "SH",
            "phenomena": ["SN"]
          }
        ],
        "clouds": [
          { "amount": "FEW", "base": 1800, "raw": "FEW018" },
          { "amount": "BKN", "base": 2500, "raw": "BKN025" }
        ],
        "temperature": {
          "air": 1,
          "dewpoint": -5
        },
        "qnh": {
          "value": 1031,
          "unit": "hPa"
        },
        "wind_shear": {
          "all_runways": true,
          "runways": null
        },
        "display": {
          "wind": "32013G25KT",
          "visibility": "10000",
          "weather": "-SHSN",
          "clouds": "FEW018 BKN025",
          "temperature": "01/-05",
          "qnh": "Q1031"
        }
      }
    },
    "RKSI": {
      "header": { "..." : "..." },
      "observation": { "..." : "..." }
    }
  }
}
```

### 5.3 display 객체 상세

사람이 읽기 쉬운 표시 문자열이다.

```
display = {
    wind:        wind.raw 그대로
    visibility:  CAVOK 시 "CAVOK", 그 외 value 문자열
    weather:     각 wx의 raw를 공백 구분 나열, 없으면 ""
    clouds:      CAVOK 시 "CAVOK", NSC 시 "NSC", 그 외 각 layer의 raw 공백 구분
    temperature: "TT/TdTd" 형식 (2자리, 영하 시 M 접두어)
    qnh:         "Q{value}" 형식
}
```

**temperature display 변환 규칙**:

```
기온/이슬점을 METAR 원문 형식으로 표시:
  양수/0: 2자리 (예: 1 → "01", 15 → "15")
  음수:   M + 2자리 (예: -5 → "M05", -12 → "M12")

조합: "{기온}/{이슬점}"

예시:
  air=1, dewpoint=-5  → "01/M05"
  air=15, dewpoint=12 → "15/12"
  air=-3, dewpoint=-8 → "M03/M08"
  air=0, dewpoint=-1  → "00/M01"
```

---

## 6. 모듈 구조

### 6.1 파일 구조

```
project/
  ├ taf_parser       ← TAF 전체: XML 파싱, 정규화, 시간별 분해, JSON 출력
  ├ metar_parser     ← METAR 전체: XML 파싱, 정규화, JSON 출력
  └ main             ← API 호출, 공항 반복, 파일 저장
```

- 2 parser 파일로 시작. 공통 로직(wind/weather/cloud 파싱 등)은 각 파일 내에 동일하게 작성한다.
- 추후 공통 함수가 많아지거나 불일치가 발생하면 shared 파일로 분리한다.

### 6.2 각 파일의 책임

**taf_parser**:
- KMA API XML → TAF 객체 파싱
- CAVOK/NSW/NSC 정규화
- 기상현상 구조화 파싱 (URL 코드 추출 → WeatherPhenomenon)
- 바람/시정/구름 변환
- 시간별 분해 (resolve_hourly, partial_merge)
- NSW 후처리 (BR 자동 부여)
- JSON 출력

**metar_parser**:
- KMA API XML → METAR 객체 파싱
- CAVOK/NSC 정규화
- 기상현상 구조화 파싱 (URL 코드 추출 → WeatherPhenomenon)
- 바람/시정/구름 변환
- 기온/이슬점/QNH/윈드시어 추출
- JSON 출력

**main**:
- 공항 목록 관리
- API 호출 (1공항 1호출)
- taf_parser / metar_parser 호출
- 파일 저장

### 6.3 공통 로직 목록 (양쪽에 동일하게 존재)

추후 분리 시 참조용으로 공통 함수를 명시한다.

| 함수 | 역할 |
|------|------|
| parse_wind(node) | 바람 노드 → WindData |
| parse_visibility(value) | 시정 값 → VisibilityData |
| parse_weather_from_url(url) | URL → WeatherPhenomenon |
| parse_weather_phenomenon(code) | 코드 문자열 → 강도/특성/현상 구조화 |
| parse_cloud_layer(node) | layer 노드 → CloudLayer |
| parse_cloud_layers(cloud_node) | 복수 layer 순회 |
| check_cavok(node) | cloudAndVisibilityOK 속성 확인 |
| extract_airport_info(node) | ICAO 코드, 공항명 추출 |
| format_display_wind(wind) | WindData → 표시 문자열 |
| format_display_weather(wx_list) | WeatherPhenomenon 배열 → 표시 문자열 |
| format_display_clouds(clouds, flags) | CloudLayer 배열 → 표시 문자열 |

이 함수들은 TAF/METAR 양쪽에서 **입력 객체 구조와 출력이 완전히 동일**해야 한다. 한쪽을 수정하면 반드시 다른 쪽도 동기화해야 하며, 동기화 부담이 커지면 shared 파일로 분리한다.

---

## 7. 검증 체크리스트

| # | 테스트 케이스 | 검증 포인트 |
|---|-------------|------------|
| 1 | RKPC 샘플 XML 파싱 | 전체 JSON 출력이 5.2절 예시와 일치 |
| 2 | CAVOK METAR | cavok_flag=true, vis=9999, wx=[], clouds=[] |
| 3 | presentWeather URL 파싱 | "-SHSN" → intensity=LIGHT, descriptor=SH, phenomena=[SN] |
| 4 | presentWeather 복수 | 여러 presentWeather 노드 → 배열로 수집 |
| 5 | presentWeather nilReason | wx=[] |
| 6 | presentWeather 노드 없음 | wx=[] (METAR는 스냅샷) |
| 7 | 구름 복수 layer | 순서 유지, 각 layer 정상 파싱 |
| 8 | 구름 NSC (nilReason) | clouds=[], nsc_flag=true |
| 9 | 기온 음수 | dewpoint=-5 → { dewpoint: -5 } |
| 10 | 기온 display | air=1, dew=-5 → "01/M05" |
| 11 | QNH | value=1031 → display "Q1031" |
| 12 | 윈드시어 allRunways=true | wind_shear.all_runways=true |
| 13 | 윈드시어 없음 | wind_shear=null |
| 14 | 바람 돌풍 있음 | gust=25 → "32013G25KT" |
| 15 | 바람 돌풍 없음 | gust=null → "32013KT" |
| 16 | 바람 정온 | speed=0 → "00000KT" |
| 17 | 바람 VRB | variable=true, speed=3 → "VRB03KT" |
| 18 | automatedStation="true" | auto=true |
| 19 | 공유 함수: TAF와 METAR에서 동일 결과 | parse_weather_from_url, parse_cloud_layer 등 |

---

## 부록 A. TAF/METAR/경보 통합 파이프라인 (main)

전체 실행 흐름은 스케줄러 설계문서(Scheduler_Cache_Design.md) 6절에 정의되어 있다. 핵심 흐름만 발췌:

```
각 데이터 타입별:
  1. 전체 공항 순회 → 통합 result 객체 구성
  2. 실패 공항 → 이전 캐시(prev_data)에서 복구, _stale 표시
  3. canonical_hash(result) 비교 → 변경 없으면 스킵
  4. 변경 있으면 save_and_update_latest() → 타임스탬프 파일 + latest.json
  5. 파일 순환 (최신 10개 유지)
```

각 parser의 `process` 함수는 XML 수신 → 파싱 → 정규화 → (TAF만: 시간별 분해)까지만 담당한다. 저장, 캐시, 순환은 main/cache_manager/file_manager가 처리한다.

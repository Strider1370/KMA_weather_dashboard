# METAR 사이드바 & TAF 타임라인/테이블 시각화 설계 문서

> **목적**: 이 프로젝트의 METAR/TAF 시각화 메커니즘을 외부 프로젝트에서 재현할 수 있도록 설명한 참조 문서.
> 외부 API에서 비슷한 기상 데이터를 가져온다면 **변수명만 매핑**하면 컴포넌트를 그대로 재사용할 수 있음.

---

## 1. 전체 데이터 파이프라인 요약

```
[외부 API 원시 데이터]
        ↓
[파서 / 어댑터 함수]   ← 이 프로젝트에서는 iwxxmMetarParser.js / iwxxmTafParser.js
        ↓
[표준 JSON 객체]       ← 이 형태만 맞추면 아래 컴포넌트를 그대로 사용 가능
        ↓
[CurrentWeather]       → METAR 사이드바
[HourlyForecast]       → TAF 타임라인 / 테이블 (HourlyForecast.jsx가 뷰 모드 전환 관리)
   ├── [TimelineView]  → 30시간 세그먼트 바 시각화
   └── [TableView]     → 12시간 표 형식 시각화
```

---

## 2. METAR 사이드바 (`CurrentWeather.jsx`)

### 2-1. 컴포넌트 Props

```jsx
<CurrentWeather
  locationName="인천국제공항"   // 문자열: 화면 상단 공항명
  metarData={metarData}         // 아래 표준 METAR 객체
  compactMode={false}           // true = 캐릭터 이미지/저작권 숨김 (슬라이드용)
/>
```

### 2-2. 표준 METAR 객체 (`metarData`)

컴포넌트가 실제로 사용하는 필드만 정리. **다른 API를 쓴다면 이 형태로 변환해서 넘기면 됨.**

```js
const metarData = {
  // ── 시간 ──────────────────────────────────────────
  observationTime: "181200Z",      // string: DDHHmmZ (METAR 전문 시각 표기)
  observationTimeISO: "2026-02-18T12:00:00.000Z", // ISO 8601 (formatMetarTime에 사용)
  issueTime: "181200Z",            // string: 발행 시각 (없으면 observationTime 사용)
  time: "2026-02-18T12:00:00.000Z", // ISO: 폴백용

  // ── 바람 ──────────────────────────────────────────
  wind: {
    direction: 270,   // number(deg) | "VRB": 가변풍
    speed: 12,        // number(kt)
  },

  // ── 시정 ──────────────────────────────────────────
  visibility: 6000,   // number(m) | null

  // ── 구름 ──────────────────────────────────────────
  clouds: [
    { type: "BKN", altitude: 1500 },  // type: FEW/SCT/BKN/OVC, altitude: ft
    { type: "OVC", altitude: 3000 },
  ],

  // ── 온도/이슬점/기압 ───────────────────────────────
  temperature: 8,           // number(°C) | null
  dewpoint: 2,              // number(°C) | null
  pressure: { value: 1013, unit: "hPa" }, // | null

  // ── 일기현상 ───────────────────────────────────────
  presentWeather: ["-RA", "BR"],  // string[]: TAF weatherCode와 동일한 코드 체계

  // ── 강수량 (선택) ──────────────────────────────────
  precipitation: 0.0,  // number(mm) | undefined: 0.0mm 이하면 UI에서 숨김

  // ── 기타 ──────────────────────────────────────────
  reportType: "METAR",  // "METAR" | "SPECI"
  auto: false,          // boolean: 자동 관측소 여부
};
```

### 2-3. METAR 사이드바가 표시하는 항목

| UI 요소 | 데이터 소스 | 변환 함수 |
|---|---|---|
| 공항명 + 관측 시각 | `observationTimeISO` → `formatMetarTime()` | `CurrentWeather/formatters.js` |
| 날씨 아이콘 | `presentWeather`, `clouds`, `visibility` → `getUnifiedWeatherIcon()` | `services/utils/weatherIcons.js` |
| 날씨 설명 텍스트 | `presentWeather`, `clouds`, `visibility` → `getMetarWeatherDescription()` | `CurrentWeather/weatherUtils.js` |
| 바람 화살표 + 속도 | `wind.direction` (+180° = 바람 방향 화살표), `wind.speed` | `CurrentWeather.jsx:103` |
| 운저고도 | `clouds` 배열 → `getCeilingText()` (BKN/OVC 중 최저값) | `CurrentWeather/weatherUtils.js` |
| 시정 | `visibility` → `getVisibilityText()` | `CurrentWeather/weatherUtils.js` |
| 온도 | `temperature` (없으면 `raw` 텍스트에서 추출) | `CurrentWeather/formatters.js` |
| 강수량 | `precipitation > 0.0`일 때만 렌더링 | `CurrentWeather.jsx:141` |

### 2-4. 바람 화살표 각도 계산

```js
// 바람이 "불어오는" 방향(from)이 아니라 "불어가는" 방향(to)으로 화살표를 표시
const arrowRotation = wind.direction === 'VRB' ? 0 : (wind.direction + 180);
// 예: 서풍(270°) → 화살표 = 90° (동쪽을 가리킴, 동쪽으로 날아감)
```

---

## 3. TAF 타임라인 / 테이블 (`HourlyForecast.jsx`)

### 3-1. 컴포넌트 Props

```jsx
<HourlyForecast
  tafData={tafData}         // 아래 표준 TAF 객체
  currentTemp={8}           // number: 현재 온도 (METAR에서 가져와 TAF 카드에 참조용)
  viewMode="timeline"       // "timeline" | "table"
  onViewModeChange={fn}     // 뷰 전환 콜백
/>
```

### 3-2. 표준 TAF 객체 (`tafData`)

> **핵심**: `tafData.finalHourly[]` 배열이 있으면 타임라인이 동작한다.
> IWXXM 파서가 이미 BECMG/TEMPO/FM을 병합해 **시간당 1행**으로 확장한 결과물.

```js
const tafData = {
  meta: {
    icao: "RKSI",
    issueTime: "2026-02-18T06:00:00Z",
    validBegin: "2026-02-18T06:00:00Z",
    validEnd: "2026-02-19T12:00:00Z",
  },

  // ── 핵심 필드: 시간당 1행 배열 ─────────────────────
  finalHourly: [
    {
      dateTime: "2026-02-18T06:00:00.000Z",  // ISO: 해당 시각
      cavok: false,                           // boolean: CAVOK 여부
      windDirDeg: 270,                        // number(deg) | null
      windKt: 12,                             // number(kt) | null
      gustKt: 18,                             // number(kt) | null
      visM: 6000,                             // number(m) | null
      weatherCode: "-RA",                     // string: 일기현상 코드 | null
      clouds: [                               // 정규화된 구름 배열
        { amount: "BKN", baseFt: 1500, type: null },
        // amount: FEW/SCT/BKN/OVC/NSC/NCD/SKC/CLR
      ],
      ceilingFt: 1500,                        // number: 최저 BKN/OVC 고도(ft) | null
      hasCB: false,                           // boolean: CB 구름 존재 여부
    },
    // ... 유효기간 내 매 시각 1행씩
  ],

  // ── 하위 호환 폴백 (finalHourly 없을 때) ─────────────
  forecasts: [],  // 기존 형식 배열 (거의 사용 안 함)
};
```

### 3-3. HourlyForecast.jsx의 데이터 변환 흐름

```
tafData.finalHourly[]
        ↓
[tafItem → next24Hours 행 변환]   ← HourlyForecast.jsx:57~272
        ↓
next24Hours[] (표준 시간행 배열)
        ↓
[groupElementsByValue()]          ← dataProcessor.js: 연속 동일값 묶기
        ↓
{weatherGroups, windGroups, cloudGroups, visibilityGroups}
        ↓
TimelineView (세그먼트 바) 또는 TableView (표)
```

### 3-4. 표준 시간행 객체 (`next24Hours[i]`)

`tafData.finalHourly` → 아래 형태로 변환된 뒤 컴포넌트에 전달됨.

```js
{
  // ── 시간 표시용 ──────────────────────────────────
  time: Date,            // JS Date 객체 (아이콘 주/야간 판단에 사용)
  timeStr: "12시",       // string: 표 헤더용
  dateStr: "18일",       // string: 날짜 변경시 표시
  showDate: true,        // boolean: 날짜 행 표시 여부 (날짜 바뀔 때 true)

  // ── 날씨 현상 ────────────────────────────────────
  weatherPhrase: "-RA",  // string: 영문 날씨 코드 또는 한글 상태 텍스트
  weatherCode: 61,       // number: WMO 4677 코드 (아이콘 선택 보조용)

  // ── 바람 ─────────────────────────────────────────
  windDirection: 270,    // number(deg)
  windSpeed: 12,         // number(kt)

  // ── 구름/시정 ─────────────────────────────────────
  ceilingFt: 1500,                   // number | null
  cloudCeiling: "BKN 1500ft",        // string: 표시용 문자열
  clouds: [{amount:"BKN",baseFt:1500}], // 원시 구름 배열
  visM: 6000,                         // number(m) | null
  visibilityFormatted: "6000m",       // string: 표시용 문자열
  cavok: false,                       // boolean

  // ── 기타 ─────────────────────────────────────────
  temperature: 8,        // 현재 온도 (TAF에는 온도 없음, METAR값 전달)
  $isCurrent: true,      // 첫 번째 행 여부
  $isTafBased: true,     // TAF 데이터 기반 행 여부
}
```

---

## 4. TimelineView — 세그먼트 바 메커니즘

### 4-1. 핵심 개념: 연속 동일값 그룹화 (Segment)

```
시간:  06 07 08 09 10 11 12 13 14
날씨: [-RA-RA-RA-RA  맑음 맑음  TS  TS]
         ↓ groupElementsByValue()
그룹: [{value:"-RA", hourCount:4}, {value:"맑음", hourCount:2}, {value:"TS", hourCount:2}]
         ↓ generateSegments()
세그: [{left:0%, width:44%}, {left:44%, width:22%}, {left:66%, width:22%}]
```

### 4-2. `generateSegments()` — 위치/너비 계산

```js
// utils.js:135
// groups: 그룹화된 배열, next30Hours: 전체 시간 배열 (너비 기준)
export const generateSegments = (groups, getColor, getLabel, next30Hours) => {
  let currentPosition = 0;
  return groups.map(group => {
    const width = (group.hourCount / next30Hours.length) * 100; // % 너비
    const segment = {
      left: currentPosition,   // % 시작 위치
      width,
      color: getColor(group.value),
      label: getLabel(group.value, group, middleTime),
      hourCount: group.hourCount,
    };
    currentPosition += width;
    return segment;
  });
};
```

### 4-3. 4개 행의 색상 기준

| 행 | 색상 기준 | 파일 |
|---|---|---|
| 날씨 | `weatherPhrase` 한글 텍스트로 색상 매핑 | `utils.js:59~83` |
| 바람 | 속도(kt): ≤15→녹색, ≤25→주황, >25→빨강 | `utils.js:85~108` |
| 운저고도 | ft: ≥5000→녹색, ≥3000→연두, ≥1500→주황, <1500→빨강 | `TimelineView.jsx:271~298` |
| 시정 | m: ≥9999→녹색, ≥5000→연두, ≥1000→주황, <1000→빨강 | `utils.js:91~115` |

### 4-4. 세그먼트 너비별 텍스트 표시 방식

```jsx
// TimelineView.jsx:370~387 (날씨 행 예시)
{segment.hourCount === 1
  ? <span>{icon}</span>                      // 1시간: 아이콘만
  : segment.hourCount === 2
  ? <><span>{icon}</span><span>{text}</span></>   // 2시간: 아이콘 + 작은텍스트
  : <><span>{icon}</span><span>{text}</span></>   // 3시간+: 아이콘 + 텍스트
}
```

---

## 5. TableView — 표 메커니즘

### 5-1. Props

```jsx
<TableView next12Hours={next24Hours.slice(0, 12)} />
// next12Hours: 표준 시간행 객체 배열, 최대 12개 (12시간)
```

### 5-2. 표 구성 (4행 × 12열)

| 행 | 표시 내용 | 데이터 필드 |
|---|---|---|
| 날씨 | 이모지 아이콘 + 한글 텍스트 | `weatherPhrase`, `weatherCode`, `time` |
| 바람 | 회전 화살표 + `{speed}kt` | `windDirection`, `windSpeed` |
| 운저고도 | `{ceilingFt}ft` | `ceilingFt` |
| 시정 | `{visibilityFormatted}` | `visibilityFormatted` |

### 5-3. 바람 화살표 각도 (TableView & TimelineView 공통)

```js
const getWindArrowRotation = (degrees) => degrees + 180;
// TimelineView에서도 동일: arrowDirection = direction + 180
```

---

## 6. 날씨 코드 → 한글/아이콘 매핑

### 6-1. 한글 변환 (`convertWeatherToKorean`)

```js
// HourlyForecast/utils.js:9~47
// weatherPhrase(영문 코드)를 한글로 변환
convertWeatherToKorean("-RA")   // → "약한비"
convertWeatherToKorean("TSRA")  // → "뇌우"
convertWeatherToKorean("맑음")  // → "맑음" (한글 그대로)
```

### 6-2. 이모지 아이콘 (`getAviationWeatherIcon`)

```js
// HourlyForecast/utils.js:163
// weatherPhrase + currentTime(주/야간 판단용) → 이모지
getAviationWeatherIcon("맑음", 0, new Date())   // 낮 → "☀️", 밤 → "🌙"
getAviationWeatherIcon("-RA", 61, new Date())   // → "🌦️"
getAviationWeatherIcon("TSRA", 95, new Date())  // → "⛈️"
```

### 6-3. 야간 판단 기준

```js
// services/utils/weatherIcons.js
// KST 18:00~06:00 = 야간
export const isNightTime = (date = new Date()) => {
  const kstHour = (date.getUTCHours() + 9) % 24;
  return kstHour >= 18 || kstHour < 6;
};
```

---

## 7. 외부 프로젝트 적용 가이드

### Step 1 — METAR 어댑터 작성

```js
// 외부 API 응답 → 이 프로젝트 metarData 형태로 변환
function adaptMetar(externalApiResponse) {
  return {
    observationTimeISO: externalApiResponse.obs_time,      // ISO 8601
    wind: {
      direction: externalApiResponse.wind_dir,             // deg or "VRB"
      speed: externalApiResponse.wind_speed_kt,
    },
    visibility: externalApiResponse.vis_meters,            // m
    clouds: externalApiResponse.cloud_layers.map(c => ({
      type: c.cover,    // FEW/SCT/BKN/OVC
      altitude: c.base, // ft
    })),
    temperature: externalApiResponse.temp_c,
    dewpoint: externalApiResponse.dewpoint_c,
    pressure: { value: externalApiResponse.altim_hpa, unit: "hPa" },
    presentWeather: externalApiResponse.wx_codes || [],    // ["-RA", "BR", ...]
    precipitation: externalApiResponse.precip_mm,
  };
}
```

### Step 2 — TAF 어댑터 작성

```js
// 외부 API의 TAF 예보 → finalHourly[] 형태로 변환
// 핵심: BECMG/TEMPO/FM을 시간당 1행으로 이미 병합한 데이터라면 그대로 매핑
function adaptTaf(externalHourlyForecast) {
  return {
    meta: { icao: "RKSI", ... },
    finalHourly: externalHourlyForecast.map(item => ({
      dateTime: item.valid_time,           // ISO 8601
      cavok: item.cavok ?? false,
      windDirDeg: item.wind_dir,           // deg
      windKt: item.wind_speed_kt,
      gustKt: item.wind_gust_kt ?? null,
      visM: item.visibility_m,            // m
      weatherCode: item.wx_code ?? null,  // "-RA", "TSRA" 등
      clouds: item.cloud_layers.map(c => ({
        amount: c.cover,   // FEW/SCT/BKN/OVC/NSC
        baseFt: c.base_ft,
        type: c.type ?? null,  // CB 등
      })),
      ceilingFt: item.ceiling_ft ?? null,
      hasCB: item.has_cb ?? false,
    })),
  };
}
```

### Step 3 — 컴포넌트 사용

```jsx
const metarData = adaptMetar(apiResponse.metar);
const tafData = adaptTaf(apiResponse.taf_hourly);

return (
  <>
    <CurrentWeather locationName="인천국제공항" metarData={metarData} />
    <HourlyForecast tafData={tafData} currentTemp={metarData.temperature} viewMode="timeline" />
  </>
);
```

---

## 8. 의존 라이브러리 (컴포넌트 직접 사용)

| 라이브러리 | 용도 |
|---|---|
| `styled-components` | 모든 UI 스타일 |
| `recharts` | HourlyForecast 내 차트 (현재 미사용 상태이나 import됨) |
| `dayjs` | TAF 파서 내부 시간 계산 (컴포넌트 직접 사용 아님) |
| `fast-xml-parser` | TAF 파서 내부 XML 파싱 (컴포넌트 직접 사용 아님) |

> 어댑터 방식으로 재사용한다면 `styled-components`만 필수.
> `dayjs`, `fast-xml-parser`는 파서를 통째로 가져오지 않는 이상 불필요.

---

*생성일: 2026-02-18 | 참조 프로젝트: weather-dashboard-latest*

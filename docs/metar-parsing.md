# METAR Parsing Implementation

Status: Current implementation spec as of 2026-05-02.

이 문서는 `backend/src/parsers/metar-parser.js`와 `backend/src/parsers/parse-utils.js` 기준의 METAR/SPECI 파싱 로직을 재구현 가능한 수준으로 설명합니다.

## 사이트에서 하는 일

METAR 파싱 결과는 `/ops`와 모바일 현재날씨 탭의 핵심 현재 관측 카드에 표시된다. 사용자는 여기서 선택 공항의 풍향/풍속, 시정, 현재 기상현상, 운고, 기온/이슬점, QNH, RVR, 윈드시어, CAVOK/NSC 여부를 확인한다.

이 파서는 KMA IWXXM XML을 화면에서 바로 쓰기 좋은 JSON으로 바꾸고, 이후 비행카테고리 색상, minima 경고, 현재날씨 아이콘, 저시정/강풍/저운고 알림 판정의 입력이 된다. 따라서 단순 XML 변환이 아니라 사이트의 현재 상태 판단 기준을 만드는 로직이다.

## Purpose

KMA API outer XML item 안의 `metarMsg` 또는 `metar` IWXXM payload를 읽어 공항별 현재 관측 JSON을 만든다.

Parser contract:

- Input: KMA response XML string.
- Output: parsed object or `null`.
- Reject condition: outer item이 없거나 ICAO를 얻지 못하면 `null`.
- Module export: `{ parse }`.

## Input Unwrapping

1. `fast-xml-parser` options:
   - `ignoreAttributes: false`
   - `attributeNamePrefix: "@_"`
   - `removeNSPrefix: false`
   - array fields: `iwxxm:presentWeather`, `iwxxm:weather`, `iwxxm:layer`, `item`
2. Outer item lookup order:
   - `response.body.items.item`
   - `body.items.item`
   - `items.item`
3. Inner METAR payload:
   - Prefer `item.metarMsg`, fallback `item.metar`.
   - If string, decode XML entities and parse again.
   - Accept roots `iwxxm:METAR`, `iwxxm:SPECI`, or already-normalized object.
4. Report type:
   - String payload containing `iwxxm:SPECI` -> `SPECI`.
   - String payload containing `iwxxm:METAR` -> `METAR`.
   - Object containing `iwxxm:SPECI` -> `SPECI`.
   - Object containing `iwxxm:METAR` -> `METAR`.
   - Default -> `METAR`.

## Output Shape

```js
{
  header: {
    icao,
    airport_name,
    report_type,
    issue_time,
    observation_time,
    automated
  },
  observation: {
    wind,
    visibility,
    weather,
    clouds,
    temperature,
    qnh,
    wind_shear,
    rvr,
    display
  },
  cavok_flag,
  nsc_flag
}
```

## Header Fields

`issue_time`:

- `iwxxm:issueTime.gml:TimeInstant.gml:timePosition`
- fallback `iwxxm:issueTime.gml:timePosition`

`observation_time`:

- `iwxxm:observationTime.gml:TimeInstant.gml:timePosition`
- fallback `iwxxm:observationTime.gml:timePosition`

`icao` lookup order:

1. `item.icaoCode`
2. `iwxxm:aerodrome.aixm:AirportHeliport.aixm:timeSlice.aixm:AirportHeliportTimeSlice.aixm:locationIndicatorICAO`
3. same AIXM path ending in `aixm:designator`

`airport_name` lookup order:

1. `item.airportName`
2. `item.airportNm`
3. AIXM airport name
4. `null`

`automated` is true when root attribute `@_automatedStation` is string `"true"` ignoring case.

## CAVOK And Visibility

`cavok_flag` is true when either root or observation has `@_cloudAndVisibilityOK="true"`.

Visibility source order:

1. `iwxxm:visibility.iwxxm:AerodromeHorizontalVisibility.iwxxm:prevailingVisibility`
2. `iwxxm:visibility.iwxxm:prevailingVisibility`
3. `iwxxm:visibility`

Visibility object:

```js
{
  value: cavok ? 9999 : number(prevailingVisibility),
  minimum_value,
  minimum_direction_degrees,
  cavok
}
```

Minimum visibility source order:

- `iwxxm:visibility.iwxxm:AerodromeHorizontalVisibility.iwxxm:minimumVisibility`
- `iwxxm:visibility.iwxxm:minimumVisibility`
- `iwxxm:minimumVisibility`

Minimum direction source order:

- `iwxxm:visibility.iwxxm:AerodromeHorizontalVisibility.iwxxm:minimumVisibilityDirection`
- `iwxxm:visibility.iwxxm:minimumVisibilityDirection`
- `iwxxm:minimumVisibilityDirection`

## Wind

Wind node:

- `iwxxm:surfaceWind.iwxxm:AerodromeSurfaceWind`
- fallback empty object.

Shared `parseWind()` rules:

- Direction comes from `iwxxm:meanWindDirection` or `iwxxm:windDirection`.
- Speed comes from `iwxxm:meanWindSpeed` or `iwxxm:windSpeed`.
- Gust comes from `iwxxm:windGustSpeed` or `iwxxm:gustSpeed`.
- Unit is normalized from node `@_uom`; supported normalization includes KT, MPS, KMH.
- `@_variableWindDirection="true"` makes raw direction token `VRB`.
- Missing wind node returns calm wind:
  - direction `0`
  - speed `0`
  - gust `null`
  - variable `false`
  - raw `00000KT`
- Raw wind format is `dddssKT`, `VRBssKT`, with optional `Ggg`.
- Wind barb metadata is computed from rounded speed using 50/10/5 knot components.

## Weather

Weather is skipped entirely when CAVOK is true.

For each `iwxxm:presentWeather` node:

1. If `@_nilReason` contains `nothingofoperationalsignificance`, skip.
2. If `@_xlink:href` exists, take `lastToken(href)`.
3. Otherwise take text content and then `lastToken(raw)`.
4. Parse with `parseWeatherCode()`.
5. Add `icon_key` using `resolveWeatherIconKey()`.

`parseWeatherCode()` normalizes:

- intensity: `-` -> `LIGHT`, `+` -> `HEAVY`, `VC` -> `VICINITY`, otherwise `MODERATE`
- descriptor: one of `MI`, `BC`, `PR`, `DR`, `BL`, `SH`, `TS`, `FZ`
- phenomena: two-letter chunks from the remaining code, restricted to valid METAR phenomena.

## Clouds And NSC

Cloud source:

- `iwxxm:cloud`

`nsc_flag` is true when cloud `@_nilReason` contains `nothingofoperationalsignificance`.

Cloud layers are parsed only when neither CAVOK nor NSC is true:

- source: `iwxxm:cloud.iwxxm:AerodromeCloud.iwxxm:layer`
- each layer passes through `parseCloudLayer()`

`parseCloudLayer()` extracts:

- amount from cloud amount `@_xlink:href` final token.
- base from `iwxxm:base`, converting meters to feet when `@_uom` indicates meters.
- raw cloud text as amount plus formatted base hundreds of feet.

Display cloud string is `NSC` if CAVOK or NSC, otherwise joined layer raw strings.

## Temperature And QNH

Temperature:

```js
{
  air: number(iwxxm:airTemperature),
  dewpoint: number(iwxxm:dewpointTemperature)
}
```

Display token uses METAR format:

- negative values are prefixed with `M`.
- values are rounded and padded to two digits.
- display is `TT/DD` only when both air and dewpoint exist.

QNH:

```js
{
  value: number(iwxxm:qnh),
  unit: text(iwxxm:qnh["@_uom"]) || "hPa"
}
```

Display is `Q${value}` when value exists.

## Wind Shear

Wind shear source:

- `iwxxm:windShear.iwxxm:AerodromeWindShear`
- fallback `iwxxm:AerodromeWindShear`

Rules:

- No wind shear node -> `null`.
- `@_allRunways="true"` -> `{ all_runways: true, runways: null }`.
- Otherwise collect `iwxxm:runway` text values.
- Empty runway list becomes `runways: null`.

## RVR

RVR collection is recursive. The parser walks the observation object and collects every key named `iwxxm:AerodromeRunwayVisualRange`.

For each RVR node:

- runway comes from `iwxxm:runway` or recursive runway designator search.
- mean comes from the first available parsed value:
  - `iwxxm:meanRVR`
  - `iwxxm:meanRunwayVisualRange`
  - `iwxxm:rvr`
- minimum: `number(iwxxm:minimumRVR)`
- maximum: `number(iwxxm:maximumRVR)`
- tendency lookup:
  - node `@_pastTendency`
  - `iwxxm:pastTendency["@_xlink:href"]`
  - `iwxxm:pastTendency`
- operator lookup:
  - node `@_meanRVROperator`
  - `iwxxm:meanRVROperator["@_xlink:href"]`
  - `iwxxm:meanRVROperator`
  - parsed magnitude operator

Runway designator normalization:

- direct `1`, `1L`, `9R` become `01`, `01L`, `09R`.
- direct `01`, `01L`, `27R` are preserved.
- nested AIXM `aixm:designator` is searched recursively.

RVR magnitude operator:

- raw value starting `P` -> `ABOVE`
- raw value starting `M` -> `BELOW`
- numeric part is parsed after removing leading `P`/`M`.

Entries with no runway and no value/min/max are dropped.

## Display Object

```js
{
  wind,
  visibility,
  minimum_visibility,
  weather,
  clouds,
  temperature,
  qnh,
  weather_icon,
  weather_intensity
}
```

Rules:

- `wind`: `observation.wind.raw`
- `visibility`: string of visibility value or `"//"`
- `minimum_visibility`: string when present, else `null`
- `weather`: joined raw weather codes
- `clouds`: `NSC` for CAVOK/NSC, otherwise joined cloud raw strings
- `weather_icon`: `CAVOK` for CAVOK, otherwise `pickPrimaryWeatherIcon(weather)`
- `weather_intensity`: first weather intensity or `null`

## Reimplementation Pseudocode

```js
function parseMetarResponse(xml) {
  const item = getFirstKmaItem(xml);
  if (!item) return null;

  const root = unwrapMetarOrSpeci(item.metarMsg || item.metar);
  const obs = root.observation?.MeteorologicalAerodromeObservation || {};
  const cavok = root.cloudAndVisibilityOK || obs.cloudAndVisibilityOK;

  const observation = {
    wind: parseWind(obs.surfaceWind),
    visibility: parseVisibility(obs, cavok),
    weather: cavok ? [] : parsePresentWeather(obs.presentWeather),
    clouds: parseClouds(obs.cloud, cavok),
    temperature: parseTemperature(obs),
    qnh: parseQnh(obs),
    wind_shear: parseWindShear(obs),
    rvr: parseRvr(obs)
  };

  observation.display = buildDisplay(observation, flags);

  const parsed = { header, observation, cavok_flag: cavok, nsc_flag };
  return parsed.header.icao ? parsed : null;
}
```

## Verification

```bash
node backend/test/run-once.js metar
```

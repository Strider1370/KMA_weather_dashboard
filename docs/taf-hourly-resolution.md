# TAF Hourly Resolution Implementation

Status: Current implementation spec as of 2026-05-02.

이 문서는 `backend/src/parsers/taf-parser.js`와 `backend/src/parsers/parse-utils.js` 기준의 TAF 시간별 분해 로직을 재구현 가능한 수준으로 설명합니다.

## 사이트에서 하는 일

TAF 파싱 결과는 `/ops` 예보 패널과 모바일 예보 탭에서 시간대별 공항 예보를 보여주는 데 사용된다. 사용자는 TAF 원문을 직접 해석하지 않고, 각 시간 슬롯마다 예상 풍향/풍속, 시정, 기상현상, 운량/운고, 위험 조건을 카드나 표 형태로 확인한다.

핵심은 IWXXM TAF의 base forecast와 BECMG/TEMPO/PROB changeForecast를 시간별 상태로 풀어내는 것이다. 이 로직이 있어야 다른 프로젝트에서도 “몇 시에 어떤 조건이 적용되는지”를 UI에 안정적으로 표시할 수 있다.

## Purpose

KMA API outer XML item 안의 `tafMsg` 또는 `taf` IWXXM payload를 읽어 유효기간의 1시간 슬롯별 forecast timeline을 만든다.

Parser contract:

- Input: KMA response XML string.
- Output: parsed object or `null`.
- Reject condition: outer item 없음, ICAO 없음, valid start/end 없음.
- Module export: `{ parse }`.

## Input Unwrapping

`fast-xml-parser` options:

- `ignoreAttributes: false`
- `attributeNamePrefix: "@_"`
- `removeNSPrefix: false`
- array fields: `iwxxm:changeForecast`, `iwxxm:weather`, `iwxxm:layer`, `item`

Outer item lookup order:

1. `response.body.items.item`
2. `body.items.item`
3. `items.item`

Inner TAF payload:

- Prefer `item.tafMsg`, fallback `item.taf`.
- If string, decode XML entities and parse again.
- Accept root `iwxxm:TAF` or already-normalized object.

## Output Shape

```js
{
  header: {
    icao,
    airport_name,
    report_type: "TAF",
    issued,
    valid_start,
    valid_end,
    report_status,
    temperatures
  },
  timeline: [
    {
      time,
      wind,
      visibility,
      weather,
      clouds,
      display
    }
  ]
}
```

Timeline contains one entry per hour, starting at `valid_start` and stopping before `valid_end`.

## Header Mapping

Issued:

- `iwxxm:issueTime.gml:TimeInstant.gml:timePosition`
- fallback `iwxxm:issueTime.gml:timePosition`

Valid period:

- `iwxxm:validPeriod.gml:TimePeriod.gml:beginPosition`
- `iwxxm:validPeriod.gml:TimePeriod.gml:endPosition`

ICAO lookup:

1. `item.icaoCode`
2. AIXM `locationIndicatorICAO`
3. AIXM `designator`

Airport name:

1. `item.airportName`
2. AIXM airport name
3. `null`

Report status:

- `iwxxm:reportStatus`
- fallback root `@_reportStatus`
- fallback `null`

## Temperature Header

Temperature source:

- `baseForecast.iwxxm:MeteorologicalAerodromeForecast.iwxxm:temperature.iwxxm:AerodromeAirTemperatureForecast`
- fallback root `iwxxm:temperature.iwxxm:AerodromeAirTemperatureForecast`

Value fields:

- `iwxxm:maximumAirTemperature`
- `iwxxm:minimumAirTemperature`
- fallback root-level maximum/minimum fields

Time fields:

- `iwxxm:maximumAirTemperatureTime.gml:TimeInstant.gml:timePosition`
- fallback `iwxxm:maximumAirTemperatureTime.gml:timePosition`
- fallback root-level time field
- same pattern for minimum time

Signed temperature parsing:

- empty -> `null`
- `M05` -> `-5`
- numeric token -> number

Temperature times are resolved with `resolveDdhh(lastToken(rawTime), issuedDate)`:

- DDHH tokens are anchored to issue month/year.
- If resolved time is more than 24h before anchor, move one month forward.
- If resolved time is more than 45 days after anchor, move one month backward.

## Forecast State Model

Internal forecast state:

```js
{
  wind,
  vis,
  wx,
  clouds,
  wx_touched,
  clouds_touched,
  cavok_flag,
  nsc_flag
}
```

Fields can be `null` in change groups to mean “not mentioned”.

Base forecast is parsed with `isBase = true`, so `wx_touched` and `clouds_touched` become true even when empty.

## Base And Change Forecast Parsing

Forecast node paths:

- Base: `iwxxm:baseForecast.iwxxm:MeteorologicalAerodromeForecast`
- Changes: each `iwxxm:changeForecast`, using nested `iwxxm:MeteorologicalAerodromeForecast` when present.

State parsing rules:

1. `@_cloudAndVisibilityOK="true"` sets CAVOK.
2. Wind source:
   - `iwxxm:surfaceWind.iwxxm:AerodromeSurfaceWindForecast`
   - fallback `iwxxm:surfaceWind.iwxxm:AerodromeSurfaceWind`
3. Visibility source:
   - `iwxxm:prevailingVisibility`
   - `iwxxm:visibility.iwxxm:prevailingVisibility`
   - `iwxxm:visibility`
4. CAVOK sets visibility to `9999`.
5. CAVOK sets weather to `[]` and clouds to `[]`, both touched.
6. Non-CAVOK weather comes from `iwxxm:weather`.
7. Non-CAVOK cloud comes from `iwxxm:cloud`.

Weather list rules:

- No weather nodes -> `{ value: null, touched: false }`.
- `@_nilReason` containing `nothingofoperationalsignificance` means NSW.
- If all weather was NSW nilReason -> `{ value: [], touched: true }`.
- Otherwise parse each weather code and add `icon_key`.

Cloud list rules:

- No cloud node -> `{ value: null, touched: false, nsc_flag: false }`.
- Cloud nilReason `nothingofoperationalsignificance` -> `{ value: [], touched: true, nsc_flag: true }`.
- Otherwise parse layers from:
  - `iwxxm:AerodromeCloudForecast.iwxxm:layer`
  - `iwxxm:AerodromeCloud.iwxxm:layer`

## Change Indicator Mapping

IWXXM change indicators map as follows:

| IWXXM value | Internal type |
|---|---|
| `BECOMING` | `BECMG` |
| `TEMPORARY_FLUCTUATIONS` | `TEMPO` |
| `PROBABILITY_30` | `PROB30` |
| `PROBABILITY_40` | `PROB40` |
| `PROBABILITY_30_TEMPORARY_FLUCTUATIONS` | `PROB30_TEMPO` |
| `PROBABILITY_40_TEMPORARY_FLUCTUATIONS` | `PROB40_TEMPO` |

Unknown values are preserved as upper-case tokens.

Each change group includes:

```js
{
  type,
  start,
  end,
  wind,
  vis,
  wx,
  clouds,
  wx_touched,
  clouds_touched,
  cavok_flag,
  nsc_flag
}
```

Groups are sorted by `start`.

## Partial Merge

`partialMerge(current, change)` deep-clones current state and applies only fields touched by the change.

Rules:

- If `change.wind != null`, replace wind.
- If `change.vis != null`, replace visibility.
- If visibility is not `9999`, clear CAVOK.
- If `change.wx_touched === true`, replace weather.
- If changed weather is not CAVOK, clear CAVOK.
- If `change.clouds_touched === true`, replace clouds, clear CAVOK, and set `nsc_flag` from change.
- If `change.cavok_flag === true`, force:
  - `cavok_flag = true`
  - `nsc_flag = false`
  - `vis = 9999`
  - `wx = []`
  - `clouds = []`

This is the key rule that allows BECMG/TEMPO groups to mention only changed fields without erasing the rest of the forecast.

## Hourly Timeline Algorithm

1. Parse base state.
2. Parse and sort change groups.
3. Split changes into:
   - `becmgList`: type `BECMG`
   - `tempoList`: `TEMPO`, `PROB30`, `PROB40`, `PROB30_TEMPO`, `PROB40_TEMPO`
4. Create hourly timestamps:
   - start at `valid_start`
   - increment 1 hour
   - include timestamps `< valid_end`
5. For each hour:
   - clone base state
   - apply every BECMG with `becmg.start <= hour`
   - apply every TEMPO/PROB group where `start <= hour < end`
   - apply visibility-to-weather fallback
   - emit output slot

Important behavior:

- BECMG end time is not used by the current implementation. Once its start time has passed, it remains active for subsequent slots.
- TEMPO/PROB end time is exclusive.
- If multiple changes apply, later groups in sorted order can overwrite fields through partial merge.

## Visibility-To-Weather Fallback

After all change groups are applied, `resolveWxByVis()` adds BR when:

- not CAVOK
- weather list exists and is empty
- visibility is numeric
- `1000 <= visibility < 5000`

The injected weather is parsed from code `BR` and receives an `icon_key`.

This affects display/condition logic when KMA encodes reduced visibility without explicit weather.

## Slot Output

Each timeline slot:

```js
{
  time,
  wind: state.wind,
  visibility: {
    value: state.vis,
    cavok: state.cavok_flag
  },
  weather: state.wx || [],
  clouds: state.clouds || [],
  display: formatDisplay(state)
}
```

Display:

```js
{
  wind,
  visibility,
  weather,
  clouds,
  weather_icon,
  weather_intensity
}
```

Display rules:

- `wind`: `state.wind.raw` or `null`
- `visibility`: string of `state.vis` or `"//"`
- `weather`: empty string for CAVOK, otherwise joined raw weather codes
- `clouds`: `NSC` for CAVOK or NSC, otherwise joined cloud raw strings
- `weather_icon`: `CAVOK` for CAVOK, otherwise `pickPrimaryWeatherIcon(weatherList)`
- `weather_intensity`: first weather intensity or `null`

## Reimplementation Pseudocode

```js
function parseTafResponse(xml) {
  const item = getFirstKmaItem(xml);
  if (!item) return null;

  const taf = unwrapTaf(item.tafMsg || item.taf);
  const header = parseHeader(taf, item);
  const base = parseForecastState(baseForecastNode(taf), true);
  const changes = parseChangeGroups(taf);

  const timeline = [];
  for (const time of hourRange(header.valid_start, header.valid_end)) {
    let state = clone(base);

    for (const change of changes.filter(c => c.type === "BECMG")) {
      if (change.start && time >= change.start) {
        state = partialMerge(state, change);
      }
    }

    for (const change of changes.filter(isTempoOrProb)) {
      if (change.start && change.end && time >= change.start && time < change.end) {
        state = partialMerge(state, change);
      }
    }

    state = resolveWxByVis(state);
    timeline.push(formatSlot(time, state));
  }

  return header.icao && header.valid_start && header.valid_end
    ? { header, timeline }
    : null;
}
```

## Frontend Notes

The backend emits the full TAF timeline. Frontend rendering may filter expired slots or use different mobile table/card views, but that should not change this backend parser contract.

## Verification

```bash
node backend/test/run-once.js taf
```

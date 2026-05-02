# Weather Parsing

Status: Current as of 2026-05-02.

이 문서는 현재 파서가 만드는 주요 JSON 형태와 핵심 파싱 규칙을 요약합니다. 재구현에 필요한 상세 로직은 파서별 current 설계문서를 우선합니다.

## 사이트에서 하는 일

기상 파싱 계층은 외부 API의 XML, 텍스트, 특수 포맷 자료를 대시보드가 공통으로 사용할 수 있는 JSON으로 바꾸는 계층이다. 이 JSON은 METAR/TAF 카드, 공항경보 목록, 지도 오버레이, 알림 판정, 날씨 아이콘과 색상 표현의 기반이 된다.

이 문서는 전체 파서의 공통 규칙과 출력 형태를 빠르게 파악하기 위한 안내서다. 특정 기능을 다른 프로젝트에 그대로 구현해야 할 때는 `metar-parsing.md`, `taf-hourly-resolution.md`, `warning-parsing.md`, `weather-overlay-data-implementation.md`, `advisory-overlays-implementation.md` 같은 상세 문서를 함께 읽어야 한다.

## Main Files

- Common helpers: `backend/src/parsers/parse-utils.js`
- METAR: `backend/src/parsers/metar-parser.js`
- TAF: `backend/src/parsers/taf-parser.js`
- Airport warnings: `backend/src/parsers/warning-parser.js`
- SIGMET/AIRMET: `backend/src/parsers/iwxxm-advisory-parser.js`, `sigmet-parser.js`, `airmet-parser.js`
- SIGWX_LOW: `backend/src/parsers/sigwx-low-parser.js`
- Frontend labels/icons: `frontend/src/utils/visual-mapper.js`, `weather-visual-resolver.js`, `weather-icon-registry.js`

All backend parsers are CommonJS modules.

## Detailed Current Specs

- [`metar-parsing.md`](metar-parsing.md): METAR/SPECI IWXXM unwrap, CAVOK/NSC, RVR, wind shear, display object.
- [`taf-hourly-resolution.md`](taf-hourly-resolution.md): TAF base/changeForecast merge, BECMG/TEMPO/PROB hourly slot resolution, BR fallback.
- [`warning-parsing.md`](warning-parsing.md): KMA airport warning item mapping, type resolution, wind shear deduplication.

## Common Parse Helpers

`parse-utils.js` provides shared normalization:

- `toArray(value)`: normalizes optional singleton/array XML values.
- `text(value)`: extracts scalar text or XML parser `#text`/`__text`.
- `number(value)`: numeric conversion with `null` fallback.
- `lastToken(raw)`: extracts the final URI/code token.
- `parseWeatherCode(rawCode)`: splits METAR/TAF weather into intensity, descriptor, and phenomena.
- `resolveWeatherIconKey(weather)` and `pickPrimaryWeatherIcon(weatherList)`: choose backend weather icon keys.
- `parseCloudLayer(layerNode)`: extracts cloud amount/base and converts meter base to feet.
- `parseWind(windNode)`: normalizes direction, speed, gust, variable/calm flags, raw wind text, and wind barb metadata.
- `resolveDdhh(ddhh, anchor)`: resolves DDHH timestamps around month rollover.
- `parseYmdhmToIso(raw)`: converts KMA `YYYYMMDDHHmm` strings to UTC ISO.

Weather intensity is currently one of `HEAVY`, `LIGHT`, `VICINITY`, or `MODERATE`.

## METAR Parser

`metar-parser.js` parses one outer KMA item and unwraps `metarMsg` / `metar`.

Root handling:

- Supports `iwxxm:METAR` and `iwxxm:SPECI`.
- Decodes XML entities before parsing nested XML strings.
- Detects report type from node/string content.
- Rejects payloads without `header.icao`.

Output shape:

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

Key behavior:

- `cloudAndVisibilityOK=true` sets visibility to `9999`, suppresses weather/cloud layers, and marks CAVOK.
- Cloud `nilReason` containing `nothingOfOperationalSignificance` becomes NSC.
- Weather nodes with `nothingOfOperationalSignificance` are skipped.
- RVR is collected recursively from `iwxxm:AerodromeRunwayVisualRange`.
- Runway designators are normalized to two digits plus optional `L/R/C`.
- Wind shear supports all-runways and runway-specific forms.
- `display` contains compact strings used by the frontend.

## TAF Parser

`taf-parser.js` parses one outer KMA item and unwraps `tafMsg` / `taf`.

Output shape:

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

Timeline algorithm:

1. Parse base forecast state.
2. Parse `iwxxm:changeForecast` groups.
3. Split validity period into one-hour slots.
4. Start each slot from the base state.
5. Apply every BECMG whose start time is at or before the slot time.
6. Apply TEMPO/PROB groups active for that slot.
7. Apply visibility-linked weather fallback.
8. Emit display fields.

Change group handling:

- IWXXM change indicators are mapped to `BECMG`, `TEMPO`, `PROB30`, `PROB40`, `PROB30_TEMPO`, or `PROB40_TEMPO`.
- Partial changes merge only touched fields.
- `CAVOK` resets visibility/weather/cloud state.
- `NSC` is represented with an empty cloud list plus `nsc_flag`.
- If weather is explicitly NSW and visibility is 1000-4999m, `BR` is injected as a display/condition fallback.

TAF payloads without ICAO or valid period are rejected to avoid poisoning `latest.json`.

## Airport Warning Parser

`warning-parser.js` parses KMA airport warning items.

Output shape:

```js
{
  type: "AIRPORT_WARNINGS",
  fetched_at,
  total_count,
  airports: {
    [icao]: {
      airport_name,
      warnings: [
        {
          issued,
          wrng_type,
          wrng_type_key,
          wrng_type_name,
          valid_start,
          valid_end,
          raw_message
        }
      ]
    }
  }
}
```

Key behavior:

- Warning type mapping comes from `shared/warning-types`.
- Type code `0` also tries `00`; leading-zero variants are considered.
- Times are parsed from KMA `YYYYMMDDHHmm` fields when present.
- WIND_SHEAR duplicate entries are removed when type and valid period match.
- Warnings are sorted by issued time per airport.

## SIGMET / AIRMET Parser

`iwxxm-advisory-parser.js` is shared by `sigmet-parser.js` and `airmet-parser.js`.

Parsed item fields include:

- sequence and lifecycle fields
- issue/valid period
- FIR/ATSU/MWO identifiers and names
- phenomenon code/label
- intensity change
- altitude limits
- motion direction/speed
- surface visibility and causes
- surface wind
- geometry and bbox

Geometry handling:

- Parses AIXM/GML `AirspaceVolume` horizontal projection.
- Supports `lat lon` and `lon lat` axis labels.
- Closes polygon rings when needed.
- Merges multiple geometry parts into Polygon or MultiPolygon.

Lifecycle handling:

- Expired items are excluded unless `includeExpired` is true.
- Cancel reports remove the cancelled sequence from the active set.
- Active items are sorted by issue time.

## SIGWX_LOW Parser

`sigwx-low-parser.js` parses KMA `odmap_ml` XML.

Output shape:

```js
{
  mode,
  show_airport,
  map_range_mode,
  amd_use,
  amd_hour,
  amd_min,
  amd_tar_low,
  fpv_safe_bound_width,
  fpv_safe_bound_height,
  items
}
```

Each item includes:

- item/contour names and labels
- icon metadata and tokenized icon names
- line/fill/curve/color attributes
- FPV and list points
- converted `lat_lngs`
- optional `rect_label`

Coordinate conversion:

- SIGWX_LOW uses FPV pixel coordinates.
- `map_range_mode` selects fixed latitude/longitude bounds.
- X maps linearly to lon; Y maps inversely to lat.

Front/cloud PNG overlay generation is handled outside this parser by `sigwx-front-overlay.js` and `sigwx-cloud-overlay.js`.

## Frontend Display Mapping

Frontend weather presentation is separate from backend parsing.

- `convertWeatherToKorean()` maps METAR/TAF weather strings and cloud state to Korean labels.
- `groupElementsByValue()` groups adjacent TAF display slots for timeline rendering.
- `weather-visual-resolver.js` and `weather-icon-registry.js` choose visual icon output.
- `MetarCard.jsx` and `TafTimeline.jsx` apply flight-category and condition styling using helper functions from `frontend/src/utils/helpers.js`.

Do not treat old icon adoption plans as backend parser contracts. Backend parser output should remain stable and frontend display mapping should adapt on top of it.

## Verification Commands

```bash
node backend/test/run-once.js metar
node backend/test/run-once.js taf
node backend/test/run-once.js warning
node backend/test/run-once.js sigmet
node backend/test/run-once.js airmet
node backend/test/run-once.js sigwx-low
```

## Superseded Source Notes

The following archived docs are historical source notes. Current behavior is documented in the root current specs above:

- `archive/appendix/METAR_Parsing_Algorithm.md`
- `archive/appendix/TAF_Hourly_Resolution_Algorithm.md`
- `archive/appendix/Warning_Parsing_Algorithm.md`
- parser portions of `SIGMET_AIRMET_Design.md`
- parser portions of `SIGWX_LOW_Design.md`
- parser/display boundary portions of `Weather_Visualization_Mapping.md`

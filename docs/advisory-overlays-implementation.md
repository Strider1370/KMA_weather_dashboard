# Advisory Overlay Implementation

Status: Current implementation spec as of 2026-05-02.

이 문서는 SIGMET, AIRMET, SIGWX_LOW 파싱과 지도 오버레이 그룹핑 로직을 다른 프로젝트에서 재구현할 수 있도록 설명합니다.

## 사이트에서 하는 일

이 기능은 `/ops` 지도에서 조종/운항 의사결정에 필요한 공역 예보와 위험 기상 구역을 지도 위에 겹쳐 보여준다. 사용자는 `SIGMET`, `AIRMET`, `SIGWX_LOW` 버튼을 켜서 위험 구역, 난류/착빙/뇌우/저시정/강풍/전선/구름 경계 같은 정보를 확인하고, 우측 상세 패널에서 항목별로 표시를 끄거나 필터링할 수 있다.

SIGMET/AIRMET은 항공고시성 위험 기상 정보를 FIR 경계 안의 다각형, 아이콘, 고도/이동 정보로 표현한다. SIGWX_LOW는 KMA 저고도 중요기상도를 파싱해서 구름 영역, 결빙고도, 지상풍, 전선, 기압계, 이동 화살표 등을 그룹으로 묶어 보여준다. 이 문서는 그런 원자료를 어떻게 현재 지도 표시용 데이터로 바꾸는지 설명한다.

## Scope

Covered files:

- `backend/src/parsers/iwxxm-advisory-parser.js`
- `backend/src/processors/sigmet-processor.js`
- `backend/src/processors/airmet-processor.js`
- `backend/src/parsers/sigwx-low-parser.js`
- `backend/src/processors/sigwx-low-processor.js`
- `backend/src/parsers/sigwx-front-overlay.js`
- `backend/src/parsers/sigwx-cloud-overlay.js`
- `frontend/src/utils/sigwx.js`
- `frontend/src/utils/advisory-filter.js`
- `frontend/src/components/InteractiveMap.jsx`

## SIGMET / AIRMET Shared Parser

SIGMET and AIRMET use `iwxxm-advisory-parser.js`; callers pass report tag `sigmet` or `airmet`.

Input contract:

- KMA outer XML response.
- Each item contains `<tag>Msg` or `<tag>` with IWXXM report XML.
- String report nodes are sanitized, XML entities are decoded, then parsed again.

Output is an active item array after lifecycle resolution.

### Item Fields

Each parsed item contains:

```js
{
  id,
  sequence_number,
  report_status,
  cancelled,
  cancelled_sequence_number,
  cancelled_valid_from,
  cancelled_valid_to,
  issue_time,
  valid_from,
  valid_to,
  fir,
  fir_name,
  atsu,
  atsu_name,
  mwo,
  mwo_name,
  phenomenon_code,
  phenomenon_label,
  time_indicator,
  intensity_change,
  altitude,
  motion,
  surface_visibility_m,
  surface_visibility_causes,
  surface_visibility_cause_labels,
  surface_wind,
  geometry,
  bbox,
  raw_xml_id
}
```

### Time And Unit Parsing

Time position lookup:

- `gml:TimeInstant.gml:timePosition`
- `gml:timePosition`
- node text

Valid period:

- `gml:TimePeriod.gml:beginPosition`
- `gml:TimePeriod.gml:endPosition`

ATS/FIR/MWO identifiers are read from AIXM `UnitTimeSlice.designator`; names from `UnitTimeSlice.name` or `AirspaceTimeSlice.name`.

### Phenomenon

Phenomenon code comes from `iwxxm:phenomenon["@_xlink:href"]` or `@_href` final token.

Known labels include:

- `SEV_ICE`, `MOD_ICE`
- `SEV_TURB`, `MOD_TURB`
- `TS`, `SQL_TS`, `OBSC_TS`, `EMBD_TS`, `FRQ_TS`
- `GR`, `MTW`, `TC`, `VA`, `CB`
- `MT_OBSC`, `IFR`, `LLWS`, `SFC_VIS`

Unknown codes are rendered by replacing underscores with spaces.

### Geometry

Geometry is parsed from AIXM `AirspaceVolume.horizontalProjection.Surface`.

Axis order:

- `@_axisLabels="lat lon"` -> input pairs are lat/lon.
- `@_axisLabels="lon lat"` -> input pairs are lon/lat.
- Default -> lat/lon.

The parser still guards ambiguous values:

- if first coordinate magnitude is > 90 and second <= 90, treat pair as lon/lat.
- if second coordinate magnitude is > 90 and first <= 90, treat pair as lat/lon.

Output coordinates are GeoJSON order `[lon, lat]`.

Polygon handling:

- read every `gml:PolygonPatch`
- read exterior `gml:LinearRing.gml:posList`
- close rings when first and last point differ
- one ring -> `Polygon`
- multiple rings -> `MultiPolygon`
- multiple geometry parts across members are merged into Polygon/MultiPolygon

Bbox is computed over outer rings as min/max lon/lat.

### Evolving Conditions

For each `iwxxm:member`, parse `SIGMETEvolvingCondition` or `AIRMETEvolvingCondition`.

Collected fields:

- geometry and altitude
- `@_intensityChange`
- `iwxxm:directionOfMotion`
- `iwxxm:speedOfMotion`
- `iwxxm:surfaceVisibility`
- `iwxxm:surfaceVisibilityCause`
- `iwxxm:surfaceWindDirection`
- `iwxxm:surfaceWindSpeed`

When multiple members exist:

- altitude: first part with lower or upper limit
- motion: first part with direction or speed
- visibility: first part with surface visibility or causes
- surface wind: first part with direction or speed
- geometry: merged across all parts

### Lifecycle Resolution

Items are keyed by:

```js
`${fir || "UNK"}:${sequence_number || id}`
```

Rules:

- Expired items are skipped unless `includeExpired === true`.
- An item is expired when `valid_to` parses and is before now.
- Cancel reports remove the cancelled sequence key:

```js
`${fir || "UNK"}:${cancelled_sequence_number || sequence_number || id}`
```

- Non-cancelled items replace previous item with same key.
- Final active items are sorted ascending by `issue_time`.

## SIGWX_LOW Backend Parser

SIGWX_LOW parser reads KMA `odmap_ml`.

Root requirements:

- `odmap_ml` must exist.
- Item arrays are under `odmap_ml.low.list_item.item`.

Map ranges:

| Mode | Lat | Lon |
|---|---|---|
| `normal` | `27.5..39` | `121..135` |
| `wide` | `27.3..44` | `119..135` |

FPV coordinate conversion:

```js
lon = minLon + (x / width) * (maxLon - minLon)
lat = maxLat - (y / height) * (maxLat - minLat)
```

Items without any converted lat/lon points are dropped.

### SIGWX_LOW Item Fields

Each item contains:

```js
{
  id,
  item_type,
  contour_name,
  item_name,
  label,
  icon_name,
  icon_tokens,
  icon_text_pos,
  is_close,
  is_fill,
  line_width,
  curve_tension,
  line_type,
  shape_type,
  color_line,
  color_back,
  label_pos_pt,
  label_pos_offset_x,
  label_pos_offset_y,
  rect_label,
  points,
  fpv_points,
  lat_lngs,
  text_label
}
```

Important details:

- `icon_tokens` split `icon_name` by `/`, remove `.png`.
- `color_line` and `color_back` accept six-digit hex and prepend `#`.
- `rect_label` keeps `left`, `top`, `width`, `height` for label placement.
- `line_width` reads the upstream misspelled attribute `@_lien_width`.
- `curve_tension` reads `@_curve_tention`.

## SIGWX_LOW Cycle Selection

SIGWX LOW issue cycles are UTC:

```js
[5, 11, 17, 23]
```

Latest cycle logic:

- If current hour equals the cycle hour but minute is before 5, use previous cycle.
- Around the next cycle, candidates include the upcoming cycle during a 60-minute prefetch window.
- Fetch candidates are probed with `maxRetries: 1`; first successful XML wins.

Saved payload includes:

- `type: "SIGWX_LOW"`
- `tmfc`
- `fetched_at`
- parsed root fields and items

After saving, backend renders tmfc-aware front and CB cloud overlays.

## Front And Cloud PNG Overlays

Front and cloud overlays are generated backend-side so the frontend can render them as image overlays.

Output files:

- `fronts_<tmfc>.png`
- `fronts_meta_<tmfc>.json`
- `clouds_<tmfc>.png`
- `clouds_meta_<tmfc>.json`

Metadata includes bounds, dimensions, render version, source hash, and path.

Cloud overlay rules:

- CB cloud boundaries are selected from SIGWX items that represent cloud boundary contours.
- Coordinates are projected to Web Mercator for image generation.
- Bounds are padded.
- Cloud lines are smoothed and rendered with scallop symbols.
- Output width is `1400`.

The frontend fetches overlay metadata for the currently selected SIGWX history `tmfc`; if metadata is missing, the overlay is omitted.

## SIGWX Frontend Grouping

`buildSigwxGroups(items)` creates render groups from SIGWX_LOW items.

Primary item:

- `item_type === 4`

Grouping algorithm:

1. Create one group per primary item.
2. Index groups by `contour_name::item_name`.
3. For each non-primary item:
   - first find groups with exact `contour_name::item_name`
   - fallback to groups with same `contour_name`
   - if group is closed and contains the item center, prefer containing groups
   - for `freezing_level`, choose nearest polyline
   - otherwise choose nearest group center
4. Attach item to best group as `childItems`.
5. Group label comes from first child with label/text/icon, otherwise primary item.

Distance approximation:

- latitude degree: `111 km`
- longitude degree: `cos(meanLat) * 111 km`

Point-in-polygon uses ray casting on `[lat, lon]` arrays.

## SIGWX Display Rules

Path rendering:

- `font_line` is not rendered as a normal path.
- CB cloud boundary path is not rendered as a normal path because it is covered by PNG overlay.
- arrow-like movement items are not rendered as paths.
- type `7`, `10`, `12` are marker/label oriented.

Label marker rules:

- `freezing_level` labels need marker only for type `10`.
- `sfc_wind` / `wind_strong` needs a marker.
- item types `7`, `8`, `10`, `11`, `12` can need label markers.

Arrow rules:

- item must have at least two lat/lon points.
- `freezing_level` is excluded.
- type `9` arrows are allowed for `cld`, `font_line`, `pressure`, or empty contour.
- type `10` arrows are allowed for empty contour or labels containing `km/h`.

Label position:

1. If `rect_label` exists, use the center of the rect converted from FPV to lat/lon.
2. Else if `label_pos_pt` points to an FPV point, use that point plus offsets.
3. Else use average of FPV points.
4. Fallback to geometric center.

Smoothing:

- `smoothSigwxLatLngs()` uses Chaikin smoothing.
- Iterations are clamped to 1..3 based on curve tension.
- Closed paths are reclosed after smoothing.

## Advisory Filters

Filter setting key:

```js
"advisory_filter_settings"
```

SIGMET/AIRMET filters map from `phenomenon_code`.

SIGWX filters map from lowercased `contour_name`.

Default groups:

- SIGMET: thunderstorm, turbulence, icing, hail, tropical cyclone, volcanic ash, duststorm
- AIRMET: turbulence, icing, sfc_wind, sfc_vis, llws, mountain_obscuration
- SIGWX: cloud, turbulence, icing_area, freezing_level, sfc_wind, sfc_vis, mountain_obscuration, pressure, front_line, jet_stream

Unknown filter keys should be treated as visible unless the UI explicitly hides them.

## Frontend Overlay Contract

SIGMET/AIRMET:

- Items without geometry are not rendered.
- Hidden item keys override filter settings.
- FIR boundary is shown when any advisory overlay is active in nationwide mode.
- SIGMET motion-bearing phenomena may render arrow + speed.
- AIRMET `SFC_WIND` may render wind text inside the diamond marker.

SIGWX_LOW:

- Current/history data comes from `/api/sigwx-low-history`.
- Front/cloud overlay metadata comes from `tmfc` query endpoints.
- Group hidden keys are separate from saved advisory filters.
- Pressure/font-line items are represented through a synthetic pressure-system group.

## Verification

```bash
node backend/test/run-once.js sigmet
node backend/test/run-once.js airmet
node backend/test/run-once.js sigwx-low
```

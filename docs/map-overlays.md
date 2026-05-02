# Map Overlays

Status: Current as of 2026-05-02.

이 문서는 `frontend/src/components/InteractiveMap.jsx` 기준의 지도 범위, 레이어, 타임라인, 오버레이 표시 규칙을 설명합니다. 백엔드 오버레이 데이터 생성 로직은 `weather-overlay-data-implementation.md`, SIGMET/AIRMET/SIGWX_LOW 파싱/그룹핑 로직은 `advisory-overlays-implementation.md`를 우선합니다.

## 사이트에서 하는 일

지도는 전국 또는 선택 공항 주변의 기상/항적 상황을 한 화면에 겹쳐 보여주는 기능이다. 사용자는 강수에코, 위성/안개, 낙뢰, SIGMET, AIRMET, SIGWX_LOW, TRAFFIC 레이어를 켜고 끄면서 현재 위험 구역과 움직이는 항적, 시간대별 레이더/위성 변화를 확인한다.

공항 모드에서는 선택 공항 주변의 낙뢰 거리권과 항적을 보는 데 초점이 있고, 전국 모드에서는 한반도 전체의 레이더/위성/공역 예보/항적을 보는 데 초점이 있다. 하단 타임라인은 레이더와 위성 프레임, 낙뢰 기준 시간, SIGWX history 선택을 함께 제어한다.

## Main Files

- Map component: `frontend/src/components/InteractiveMap.jsx`
- SIGWX helpers: `frontend/src/utils/sigwx.js`
- Advisory filters: `frontend/src/utils/advisory-filter.js`
- API helpers for SIGWX overlays: `frontend/src/utils/api.js`
- Radar renderer/backend: `backend/src/processors/radar-echo-processor.js`, `backend/src/parsers/radar-echo-parser.js`
- Satellite renderer/backend: `backend/src/processors/satellite-processor.js`, `backend/src/parsers/satellite-parser.js`
- Lightning collector/parser: `backend/src/processors/lightning-processor.js`, `backend/src/parsers/lightning-parser.js`
- ADS-B collector: `backend/src/processors/adsb-processor.js`
- Advisory collectors/parsers: `sigmet-processor.js`, `airmet-processor.js`, `sigwx-low-processor.js`

## Map Modes

`InteractiveMap` has an internal `mapScope`:

| Scope | Label | Behavior |
|---|---|---|
| `nationwide` | 전국 | Uses Korea-wide center/zoom and nationwide overlays. |
| `airport` | 공항 | Centers around the selected airport and shows airport range/zone context. |
| `forecast` | 예보 | Ground mode only; renders `TafForecastView` instead of Leaflet map. |

In `/ground`, the `예보` tab is added and SIGMET/AIRMET/SIGWX_LOW buttons are hidden. In `/ops`, only 전국/공항 scopes are exposed.

Mobile `/ops` passes `isVisible` and `mapActivationKey` so Leaflet can invalidate/recenter after the map tab becomes visible.

## Boundary Data

Boundaries are loaded once into a module-level cache:

- `frontend/public/geo/korea_boundaries.v1.topojson`
- fallback `korea_sido.v1.geojson`
- fallback `korea_sigungu.v1.geojson`
- `korea_neighbors_masked.v1.geojson`
- `rkrr_fir.geojson`

Boundary detail is automatic:

- `zoom >= 9`: `sigungu`
- `zoom < 9`: `sido`

There is no user-facing boundary detail toggle.

When satellite is visible, coastline/admin strokes switch to yellow tones for contrast.

## Layer Toggles

Current toggle states:

| State | Label | Default | Notes |
|---|---|---:|---|
| `showEcho` | 강수에코 | on | Disabled if no echo frame metadata exists. |
| `showSatellite` | 안개 / 위성 | off | Label is `안개` in `/ops`, `위성` in `/ground`. |
| `showLightning` | 낙뢰 | off | Adds time legend and optional blinking toggle. |
| `blinkLightning` | 깜빡임 | off | Only visible when lightning is enabled. |
| `showSigmet` | SIGMET | off | Hidden in `/ground`. |
| `showAirmet` | AIRMET | off | Hidden in `/ground`. |
| `showSigwxLow` | SIGWX_LOW | off | Hidden in `/ground`. |
| `showTraffic` | TRAFFIC | off | Applies callsign and altitude filters from settings. |

## Radar Echo

Radar echo frames come from `echoMeta.frames` and are rendered through Leaflet `ImageOverlay`.

- Current data path: `/data/radar/echo_meta.json` and `/data/radar/echo_korea_<tm>.png`.
- The map shows the rain-rate legend when echo is active.
- Frames are preloaded in the browser.
- The timeline starts from the latest frame when not playing.
- Playback speed is adjustable from 0.1s to 2.0s per frame.
- Loop handles can constrain playback to a subrange.
- Korea mode draws a unioned radar coverage boundary and can dim only the area outside coverage.

The backend currently renders nationwide frames rather than old SVG/DIV radar overlays.

## Satellite

Satellite frames come from `satMeta.frames` and are rendered through Leaflet `ImageOverlay`.

- Current data path: `/data/satellite/sat_meta.json` and `/data/satellite/sat_korea_<tm>.png`.
- Satellite opacity is fixed at `1`.
- If echo and satellite are both enabled, echo frames drive the shared timeline and the closest satellite frame at or before the active echo timestamp is selected.
- If echo is off and satellite is on, satellite frames drive the timeline directly.
- A last-good satellite frame is kept to avoid blanking during metadata transitions.

## Lightning

Lightning is based on nationwide strike history.

- Visible strikes use a 60-minute window ending at the active radar/satellite frame time.
- If no active frame time is available, current time is used.
- Strike colors encode 10-minute age bands.
- The lightning legend shows the reference time and band labels.
- Airport mode shows 8/16/32 km zone rings and zone counts for the selected airport.
- Nationwide mode shows nationwide strikes but does not show airport zone rings.

The visible source prefers `lightningData.nationwide.strikes`; if absent, it falls back to per-airport strikes.

## Traffic / ADS-B

`TRAFFIC` renders ADS-B aircraft markers from `adsbData.aircraft`.

Filtering rules:

- Ground aircraft are excluded.
- Aircraft must have numeric `lat` and `lon`.
- Callsign filter is comma-separated, case-insensitive substring matching.
- Empty callsign filter means show all callsigns.
- Altitude bands are required; an empty selected band list hides all traffic.
- `baro_altitude` is preferred; `geo_altitude` is fallback.
- Altitude is converted from meters to feet before band comparison.

Scope rules:

- Nationwide mode shows all filtered aircraft.
- Airport mode shows filtered aircraft within 120 km of the selected airport.

Markers use aircraft heading when available and show callsign/ICAO24, flight level, groundspeed, and heading in a tooltip.

## SIGWX_LOW

SIGWX_LOW uses the latest/current selected history entry.

- History entries come from `/api/sigwx-low-history`.
- The history control appears in the radar timeline area when SIGWX_LOW is enabled.
- Front and cloud overlays are fetched by selected `tmfc` through:
  - `/api/sigwx-low-fronts?tmfc=...`
  - `/api/sigwx-low-clouds?tmfc=...`
- Front overlays render in pane `sigwx-front-pane` with z-index 405.
- CB/cloud overlays render in pane `sigwx-cloud-pane` with z-index 406.
- Both are Leaflet `ImageOverlay` PNG layers generated by the backend.

Item handling:

- `buildSigwxGroups()` groups related contour/label/icon items.
- Pressure/font-line related items are represented as a synthetic pressure-system group.
- Cloud groups can control visibility of precomputed CB/cloud overlays.
- Hidden group keys are tracked separately from global advisory filters.
- SIGWX filter keys are resolved by `getSigwxFilterKey(item.contour_name)`.
- FIR boundary is shown in nationwide mode when SIGWX_LOW/SIGMET/AIRMET is active.

Markers and labels:

- SIGWX marker icons use `frontend/public/icon_sigwx/`.
- Phenomenon icons render without a white badge background.
- Meaningful sublabels and altitude chips can be shown separately.
- Some movement/pointer annotations render as arrows based on point order.
- Marker density/label visibility is zoom-aware.

## SIGMET / AIRMET

SIGMET and AIRMET items come from `sigmetData.items` and `airmetData.items`.

- Items without geometry are not rendered.
- Visibility is controlled by per-item hidden keys and advisory filter settings.
- SIGMET filter keys come from `phenomenon_code`.
- AIRMET filter keys come from `phenomenon_code`.
- Detail badges show active counts and open a side panel with per-item visibility toggles.
- FIR boundary is shown in nationwide mode when any advisory overlay is active.

Rendering uses icon-first markers:

- SIGMET motion-bearing phenomena can render larger arrows plus speed text.
- AIRMET `SFC_WIND` renders wind text inline in the diamond icon.
- Altitude/text chips are suppressed at lower zoom levels to reduce overlap.

## Pane Order

Important pane z-index order:

| Pane | z-index | Content |
|---|---:|---|
| `boundary-fill-pane` | 350 | Korea boundary fill when echo/satellite are off |
| `satellite-pane` | 390 | Satellite/fog image |
| `echo-pane` | 400 | Radar echo image |
| `sigwx-front-pane` | 405 | Precomputed SIGWX front PNG |
| `sigwx-cloud-pane` | 406 | Precomputed SIGWX CB/cloud PNG |
| `radar-range-pane` | 420 | Radar coverage boundary and outside mask |
| `boundary-case-pane` | 430 | Boundary casing |
| `boundary-line-pane` | 440 | Boundary lines |
| `fir-boundary-pane` | 445 | FIR boundary |
| `strike-pane` | 500 | Lightning markers |
| `traffic-pane` | 510 | ADS-B aircraft markers |

## Timeline

The bottom timeline controls radar, satellite, lightning reference time, and SIGWX history:

- Active frame source prefers echo frames when echo is enabled.
- Satellite frames drive the timeline only when echo is off and satellite is enabled.
- Lightning reference time follows the active frame time.
- Play/pause is disabled if there is only one frame.
- Loop handles can restrict playback range.
- SIGWX history controls replace lightning summary when SIGWX_LOW is enabled.

## Superseded Source Notes

The following existing docs should be merged into this document and then archived or marked superseded:

- `map.md`
- `radar_binary_lightning_overlay_design.md`
- `radar_image_design_v_2_overlay_div.md`
- map/UI portions of `Lightning_Data_Design.md`
- map/UI portions of `satellite_overlay_design.md`
- map/UI portions of `SIGWX_LOW_Design.md`
- `SIGMET_AIRMET_Design.md`
- map/UI portions of `ads-b.md`

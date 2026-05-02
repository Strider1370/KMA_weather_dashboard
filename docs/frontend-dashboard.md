# Frontend Dashboard

Status: Current as of 2026-05-02.

이 문서는 현재 React 대시보드의 라우트, 레이아웃, 주요 표시 규칙을 설명합니다. 과거 UI 설계 문서의 계획성 문구보다 현재 코드가 우선입니다.

## 사이트에서 하는 일

프론트엔드는 사용자가 실제로 보는 대시보드 화면이다. `/ops`는 운항/항공기상 중심 화면으로 METAR, TAF, 공항경보, 지도 오버레이를 보여준다. `/ground`는 지상근무자 관점의 화면으로 현재 날씨, 주간 예보, 지도/위성/낙뢰/항적을 더 단순한 구성으로 보여준다. `/test`는 실제 공항을 사용하되 정적 test snapshot을 우선 읽어 UI와 파서 결과를 확인하는 화면이다.

모바일 `/ops`는 데스크톱과 다르게 현재날씨, 예보, 지도 탭으로 나뉜다. 작은 화면에서 METAR/TAF/경보/지도를 한 번에 보려 하지 않고, 공항 현황 확인과 예보 확인, 지도 확인을 각각 빠르게 전환하는 구조다.

## Main Files

- App shell and polling state: `frontend/src/App.jsx`
- Route mode helper: `frontend/src/utils/route-mode.js`
- API client: `frontend/src/utils/api.js`
- Main stylesheet: `frontend/src/App.css`
- Current weather panels: `MetarCard.jsx`, `GroundCurrentWeatherCard.jsx`
- Forecast panels: `TafTimeline.jsx`, `GroundForecastPanel.jsx`, `TafForecastView.jsx`
- Map panel: `InteractiveMap.jsx`
- Settings and alerts: `frontend/src/components/alerts/`, `frontend/src/utils/alerts/`

## Routes

`frontend/src/utils/route-mode.js` maps paths as follows:

| Path | Mode | Notes |
|---|---|---|
| `/ops` | `ops` | Aviation operations dashboard. |
| `/ground` | `ground` | General/ground staff dashboard. |
| `/test` | `ops` with test flag | Uses test snapshots where available and hides mock-only airport entries from normal selection. |
| other paths | `ops` | Server redirects `/` to `/ops`; unknown static paths can still 404 at server level. |

`frontend/src/utils/route-mode.js` defines route-specific airport storage keys, but current `App.jsx` derives the active key locally:

- `/test`: `selected_airport_test`
- all other routes, including `/ops` and `/ground`: `selected_airport`

If route persistence behavior is changed later, update both `route-mode.js` and the local `selectedAirportKey` logic in `App.jsx`.

## Data Loading And Polling

Initial load happens in `loadAllData()` and `loadStaticData()`.

- Static data: airports, warning types, alert defaults.
- Dynamic data: METAR, TAF, warning, SIGMET, AIRMET, SIGWX_LOW, AMOS, lightning, ADS-B, radar metadata, satellite metadata, ground forecast, ground overview, environment.
- `/test` mode prefers `frontend/public/test/*` files before live endpoints.
- After initial load, polling reads `/api/snapshot-meta` and only refetches datasets whose `content_hash` or frame timestamp changed.
- The polling interval comes from alert settings: `settings.global.poll_interval_seconds`, defaulting to 30 seconds if unset.

## Desktop `/ops`

Desktop `/ops` uses a two-column dashboard grid:

- Left header: airport selector.
- Right top: mode switch and settings button.
- Left body: `WarningList`, `MetarCard`, `TafTimeline`.
- Right body: `InteractiveMap`.

`MetarCard` displays:

- Flight category from visibility and ceiling, using configurable airport minima.
- Visibility, RVR when present, ceiling, wind, current weather, crosswind, temperature/humidity, feels-like temperature, QNH, and AMOS daily rainfall.
- Current weather title art from `frontend/public/gisang-i/`.
- Dark-aware inline colors for flight-category-tinted panels.

`TafTimeline` displays:

- Desktop timeline view (`v2`) with grouped rows for flight category, weather, wind, visibility, and ceiling.
- Desktop table/card views (`table`, `v3`) using the same display slot rules.
- Expired slots are filtered out in live routes: a slot is kept only if `slot.time + 1h > Date.now()`.
- `/test` bypasses the expired-slot filter so snapshots remain visible.
- If all TAF slots are expired, the panel shows `TAF 유효 기간이 만료됐습니다.`

## Mobile `/ops`

Mobile `/ops` is enabled when all conditions are true:

- route is not `/test`
- `dashboardMode === "ops"`
- viewport width is `<= 768`

The mobile layout is intentionally separate from desktop `/ops` and `/ground`.

Mobile state:

- Bottom tab key: `mobile_ops_tab`
- Forecast view key: `mobile_ops_taf_view`
- Tabs: `meta`, `taf`, `map`
- Labels: `현재날씨`, `예보`, `지도`

Mobile interactions:

- Horizontal swipe moves between tabs.
- Pull down outside the map tab shows a refresh hint and reloads the page after the threshold.
- Tab entry animation uses direction based on tab order.
- Entering the map tab increments `mapActivationKey` so Leaflet can resync visible size.

Mobile `현재날씨` tab:

- Renders `WarningList` first.
- Then renders `MetarCard` in `mobileLayout` mode.
- Header includes sunrise/sunset.
- Cards include visibility, ceiling, wind, crosswind, current weather, temperature/humidity/feels-like, daily rainfall, QNH, and RVR if present.

Mobile `예보` tab:

- Uses `TafTimeline` in `mobileLayout` mode.
- Label `카드` maps to internal `table` mode: vertical cards with a proportional left timeline bar.
- Label `표` maps to internal `v3` mode: row-table style forecast.
- Both mobile modes keep the same condition styling as desktop TAF: visibility/ceiling tint, high-wind alert, special weather emphasis, and precipitation emphasis.

Mobile `지도` tab:

- Renders `InteractiveMap` with `mobileLayout`.
- `isVisible` is true only while the map tab is active.
- Map visibility re-entry is coordinated through `mapActivationKey`.

## `/ground`

`/ground` keeps the same desktop shell but replaces the aviation-focused left panels:

- `MetarCard` is replaced by `GroundCurrentWeatherCard`.
- `TafTimeline` is replaced by `GroundForecastPanel`.
- The map receives `dashboardMode="ground"`.

`GroundCurrentWeatherCard` uses:

- METAR for current condition, temperature, dew point, wind, and weather.
- `ground_forecast` for today's low/high.
- airport latitude/longitude for sunrise/sunset estimation.
- AMOS for daily rainfall.
- `environment` for PM10, PM2.5, and UV.
- helper computations for feels-like temperature and relative humidity.

`GroundForecastPanel` shows a 7-day AM/PM forecast:

- Day title: today/tomorrow/day-after labels for the first three days.
- AM/PM weather icon and rain probability.
- Daily low/high temperature.
- Partial-source status text when a source failed or a stale fallback is used.

The `/ground` map has ground-specific behavior in `InteractiveMap`:

- SIGMET/AIRMET/SIGWX_LOW overlay buttons are hidden.
- The satellite label changes to `위성`.
- A forecast tab can render `TafForecastView`.

`TafForecastView`:

- Builds segments from non-expired TAF slots.
- Maps TAF weather/time to pre-generated airport images under `frontend/public/airport_weather/{ICAO}/`.
- Supports a clickable segmented time slider.
- Plays a 40-second loop with a moving playhead.
- Crossfades weather images when the selected segment changes.

## `/test`

`/test` is snapshot-oriented:

- `fetchPreferTest()` tries `frontend/public/test/*` JSON first.
- If a test file is missing, it falls back to the live endpoint when configured.
- The legacy `TST1` mock airport is hidden from the selector.
- TAF expired-slot filtering is disabled so old snapshots remain useful.

## Settings And Local Storage

Important persisted UI keys:

| Key | Owner | Purpose |
|---|---|---|
| `time_zone` | `App.jsx` / settings | UTC/KST display mode. |
| `map_theme` | `App.jsx` / settings | Site-wide light/dark theme. |
| `taf_view_mode` | `TafTimeline` | Desktop TAF view mode. |
| `mobile_ops_tab` | mobile `/ops` | Active bottom tab. |
| `mobile_ops_taf_view` | mobile `/ops` | Mobile forecast mode. |
| `traffic_callsign_filter` | map/settings | Traffic callsign substring filter. |
| `traffic_altitude_bands` | map/settings | Selected ADS-B altitude bands. |
| `airport_minima_settings` | settings/helpers | Airport-specific LIFR minima and category tint thresholds. |

Advisory filter settings are loaded and saved through `frontend/src/utils/advisory-filter.js`.

## Theme

Dark mode is site-wide, not map-only.

- `mapTheme` defaults to `localStorage.getItem("map_theme") || "light"`.
- On change, `document.documentElement.setAttribute("data-theme", mapTheme)` is called.
- `frontend/index.html` has a FOUC-prevention script that applies the theme before React mounts.
- `App.css` contains `[data-theme="dark"]` variable overrides.
- Some METAR/TAF colors are inline styles, so `isDarkTheme()` is used in `MetarCard.jsx` and `TafTimeline.jsx`.

## Weather Visuals

Weather display uses a combination of:

- `WeatherIcon.jsx`
- `frontend/src/utils/visual-mapper.js`
- `frontend/src/utils/weather-visual-resolver.js`
- `frontend/src/utils/weather-icon-registry.js`
- `frontend/public/gisang-i/`
- `frontend/public/airport_weather/`

METAR current-weather title image rules:

- thunder (`TS`, `TSRA`) -> `TS.png`
- fog (`FG`) -> `FG.jpg`
- snow variants -> `SN.png`
- rain/drizzle/showers -> `RN_DZ.png`
- otherwise clear images rotate by date and active timezone
- clear weather forces `clear_christmas.png` on December 24-25

## Superseded Source Notes

The following existing docs should be merged into this current-state document and then archived or marked superseded:

- `Visualization.md`
- `mobile-ops-layout-plan.md`
- `darkmode.md`
- `Airport_Weather_Forecast_View.md`
- UI portions of `ground-forecast-design.md`
- UI/icon portions of `Weather_Visualization_Mapping.md`
- current-weather icon portions of `Basmilius_Weather_Icon_Adoption_Plan.md`

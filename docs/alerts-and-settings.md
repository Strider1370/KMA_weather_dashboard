# Alerts And Settings

Status: Current as of 2026-05-02.

이 문서는 현재 알림 엔진, 설정 모달, advisory 필터, LIFR minima, traffic 필터의 동작을 설명합니다.

## 사이트에서 하는 일

이 기능은 사용자가 선택한 공항의 기상 상태가 위험 기준을 넘었을 때 화면 팝업, 소리, 하단 marquee로 알려주는 시스템이다. 예를 들어 새 공항경보가 발령되거나, 시정이 낮아지거나, 강풍/돌풍이 기준을 넘거나, TAF 안에 뇌우/강설/저시정 예보가 들어오거나, 공항 주변 낙뢰가 새로 감지되면 알림이 발생한다.

설정 모달에서는 시간대, 사이트 테마, 알림 채널, 알림 기준값, 조용한 시간, Traffic 필터, 공항별 LIFR minima, SIGMET/AIRMET/SIGWX 필터를 조정한다. 대부분의 설정은 브라우저 `localStorage`에 저장되므로 같은 서버라도 사용자 브라우저마다 다르게 동작한다.

## Main Files

- Defaults: `shared/alert-defaults.js`
- Settings modal: `frontend/src/components/alerts/Settings.jsx`
- Alert engine: `frontend/src/utils/alerts/alert-engine.js`
- Alert triggers: `frontend/src/utils/alerts/alert-triggers.js`
- Alert state/cooldown: `frontend/src/utils/alerts/alert-state.js`
- Dispatcher: `frontend/src/utils/alerts/alert-dispatcher.js`
- UI components: `AlertPopup.jsx`, `AlertSound.jsx`, `AlertMarquee.jsx`
- Advisory filters: `frontend/src/utils/advisory-filter.js`
- Flight category/minima helpers: `frontend/src/utils/helpers.js`

## Settings Storage

Alert settings are split between server defaults and browser-local overrides.

| Setting | Storage key | Owner |
|---|---|---|
| Alert overrides | `aviation-weather-alert-settings` | `alert-settings.js` |
| Timezone | `time_zone` | `App.jsx`, `Settings.jsx` |
| Site theme | `map_theme` | `App.jsx`, `Settings.jsx` |
| Traffic callsign filter | `traffic_callsign_filter` | `App.jsx`, `Settings.jsx`, `InteractiveMap.jsx` |
| Traffic altitude bands | `traffic_altitude_bands` | `App.jsx`, `Settings.jsx`, `InteractiveMap.jsx` |
| Airport minima | `airport_minima_settings` | `App.jsx`, `Settings.jsx`, helpers |
| Advisory filters | `advisory_filter_settings` | `advisory-filter.js`, `Settings.jsx`, `InteractiveMap.jsx` |

`resolveSettings(defaults)` deep-merges browser overrides over `shared/alert-defaults.js`.

## Alert Evaluation Flow

1. `App.jsx` loads alert defaults from `/api/alert-defaults`.
2. `resolveSettings()` merges local overrides.
3. On data changes, `evaluate(currentData, previousData, settings)` runs enabled triggers.
4. `buildAlertKey(result, selectedAirport)` creates a cooldown key.
5. `isInCooldown()` suppresses repeated alerts during the configured cooldown.
6. `recordAlert()` stores the firing timestamp.
7. `dispatch()` sends the alert to enabled channels.
8. `clearResolvedAlerts()` removes history for triggers that are no longer active.

Alert evaluation is per selected airport and currently evaluates:

- METAR
- TAF
- airport warnings
- lightning

Changing the selected airport clears active popups and banners in `App.jsx`.

## Trigger Implementation Rules

The alert engine iterates the static trigger list from `alert-triggers.js`. A trigger is skipped when its settings entry is missing or `enabled === false`. Trigger exceptions are caught and logged so one broken trigger does not stop the rest of the evaluation cycle.

### Warning Issued

New warning key:

```js
`${wrng_type}:${valid_start}:${valid_end}`
```

Rules:

- If there is no current warning list, no alert.
- If there is no previous warning list, every current warning is considered new.
- Only warnings whose raw `wrng_type` is included in `params.types` are emitted.
- Severity is always `critical`.
- Data payload is the filtered warning list.

Default types: `00`, `1`, `2`, `3`, `4`, `5`, `7`, `8`, `13`.

### Warning Cleared

Cleared warnings use the same key as warning-issued, but compare previous warnings against the current warning set.

Rules:

- If there is no previous warning list, no alert.
- If there is no current warning list, every previous warning is considered cleared.
- Only configured `params.types` are emitted.
- Severity is `info`.

### Low Visibility

Source: `current.observation.visibility.value`.

Rules:

- Missing visibility -> no alert.
- Alert when `visibility < params.threshold`.
- Severity is `critical` when visibility is below `500m`; otherwise `warning`.

Default threshold: `1500m`.

### High Wind

Source: `current.observation.wind`.

Rules:

- Missing wind -> no alert.
- Alert when mean wind speed is `>= params.speed_threshold`.
- Alert when gust exists and is `>= params.gust_threshold`.
- Severity is `critical` when gust exists and is `>= 50kt`; otherwise `warning`.

Default thresholds:

- mean speed: `25kt`
- gust: `35kt`

### Weather Phenomenon

Source: `current.observation.weather`.

For each parsed weather item:

```js
combo = descriptor + phenomena.join("")
```

A configured target matches when:

- `combo.includes(target)`, or
- `phenomena.includes(target)`, or
- `descriptor === target`

Rules:

- Empty weather list -> no alert.
- Severity is `critical` if any matched target is `TS` or `FC`; otherwise `warning`.

Default targets: `TS`, `SN`, `FZRA`, `FZFG`, `SS`, `DS`.

### Low Ceiling

Source: `current.observation.clouds`.

Rules:

- Empty cloud list -> no alert.
- Find the first cloud layer whose `amount` is in `params.amounts`.
- Alert when that layer exists and `base < params.threshold`.
- Severity is `critical` when base is below `200ft`; otherwise `warning`.

Default:

- threshold: `500ft`
- ceiling amounts: `BKN`, `OVC`

### TAF Adverse Weather

Source: `current.timeline`.

Rules:

- Scan forecast slots from now through `now + params.lookahead_hours`.
- Skip slots before now or after the lookahead limit.
- Add visibility alert when `slot.visibility.value < params.vis_threshold`.
- For each slot weather item, build `descriptor + phenomena.join("")` and match with `params.phenomena`.
- Severity is `critical` when any alert detail includes `TS`; otherwise `warning`.

Default:

- lookahead: `6h`
- visibility threshold: `3000m`
- phenomena: `TS`, `SN`, `FZRA`

### Lightning Detected

Strike identity key:

```js
`${time}:${lon}:${lat}:${type}`
```

Rules:

- Empty current strike list -> no alert.
- Filter current strikes by configured `types` and `zones`.
- If filtered count is below `params.min_count`, no alert.
- Compare filtered strikes against previous strike keys; only fresh strikes alert.
- Count fresh strikes by zone: `alert`, `danger`, `caution`.
- Severity:
  - any `alert` zone strike -> `critical`
  - otherwise any `danger` zone strike -> `warning`
  - otherwise `info`
- Nearest distance is `Math.min(...fresh.map(distance_km || 999))`.

Default:

- min count: `1`
- types: `G`, `C`
- zones: `alert`, `danger`, `caution`

## Cooldown Keys

Cooldown keys are built from trigger result and selected ICAO:

| Trigger | Key suffix |
|---|---|
| `warning_issued`, `warning_cleared` | warning name plus valid period list |
| `low_visibility` | threshold |
| `high_wind` | ICAO only |
| `weather_phenomenon` | matched weather codes |
| `low_ceiling` | ICAO only |
| `taf_adverse_weather` | ICAO only |
| `lightning_detected` | newest fresh strike time |

`isInCooldown(key, cooldownSeconds)` suppresses alerts while `(Date.now() - lastFired) / 1000 < cooldownSeconds`.

`recordAlert(key)` stores `firstFired`, updates `lastFired`, and increments `count`.

`clearResolvedAlerts(firedKeys)` removes any previous alert key that did not fire in the current evaluation cycle.

## Default Global Settings

From `shared/alert-defaults.js`:

| Key | Default |
|---|---:|
| `alerts_enabled` | `true` |
| `poll_interval_seconds` | `60` |
| `cooldown_seconds` | `300` |
| `quiet_hours` | `null` |

`App.jsx` uses `poll_interval_seconds` to schedule snapshot polling. If no value is available, it falls back to 30 seconds.

## Dispatchers

| Dispatcher | Default | Notes |
|---|---|---|
| Popup | enabled, auto dismiss 10s | Rendered by `AlertPopup.jsx`; preview supported. |
| Sound | enabled, volume 70 | Repeat count is severity-dependent; critical defaults to 3. |
| Marquee | enabled, min severity warning | Rendered at bottom with configured duration. |

The settings modal can preview popup, sound, and marquee behavior without waiting for a real trigger.

## Triggers

Current triggers from `alert-triggers.js`:

| ID | Category | Default | Summary |
|---|---|---:|---|
| `warning_issued` | warning | on | New airport warning from current vs previous warning list. |
| `warning_cleared` | warning | on | Warning present previously but not currently. |
| `low_visibility` | METAR | on | Current METAR visibility below threshold. |
| `high_wind` | METAR | on | Mean wind or gust exceeds threshold. |
| `weather_phenomenon` | METAR | on | Configured phenomena appear in current weather. |
| `low_ceiling` | METAR | on | First configured ceiling layer below threshold. |
| `taf_adverse_weather` | TAF | on | Lookahead window contains low visibility or configured phenomena. |
| `lightning_detected` | lightning | on | New strike matching type/zone/min-count filters. |

Default trigger parameters live in `shared/alert-defaults.js`.

## Settings Modal Tabs

`Settings.jsx` exposes five tabs:

| Tab | Purpose |
|---|---|
| `일반` | Timezone and site theme. |
| `알림` | Alert channels, quiet hours, cooldowns, trigger toggles and thresholds. |
| `항적` | Traffic callsign and altitude filters. |
| `LIFR` | Airport-specific minima thresholds. |
| `공역예보` | SIGMET/AIRMET/SIGWX filter chips. |

Buttons:

- `초기화`: clears alert overrides, timezone/theme, traffic filters, minima, and advisory filters.
- `적용`: saves without closing.
- `저장`: saves and closes.

## Traffic Settings

Traffic settings are applied in `InteractiveMap.jsx`.

- Callsign filter is comma-separated and case-insensitive.
- Empty callsign filter means all callsigns are accepted.
- Altitude band options are:
  - `0-10000`
  - `10000-20000`
  - `20000-30000`
  - `30000-40000`
  - `40000-50000`
- If no altitude band is selected, no aircraft are shown.
- Altitude uses `baro_altitude` first and `geo_altitude` as fallback, converted from meters to feet.

## Airport Minima

Airport minima settings are stored in `airport_minima_settings`.

- Settings are normalized with `normalizeAirportMinimaSettings()`.
- Defaults come from `DEFAULT_AIRPORT_MINIMA_RULES`.
- The UI exposes visibility in meters and ceiling in feet per airport.
- Values feed METAR/TAF flight category and visibility/ceiling tint classification helpers.
- RKSI/RKSS can use NO DH-style ceiling behavior through default/empty ceiling handling.

## Advisory Filters

Advisory filters are stored under `advisory_filter_settings`.

Default groups:

| Section | Filter groups |
|---|---|
| SIGMET | thunderstorm, turbulence, icing, hail, tropical cyclone, volcanic ash, duststorm |
| AIRMET | turbulence, icing, sfc_wind, sfc_vis, llws, mountain_obscuration |
| SIGWX | cloud, turbulence, icing_area, freezing_level, sfc_wind, sfc_vis, mountain_obscuration, pressure, front_line, jet_stream |

Filter mapping:

- SIGMET/AIRMET use `phenomenon_code`.
- SIGWX uses lowercased `contour_name`.
- Filters are applied in `InteractiveMap.jsx` before rendering visible advisory items.

Advisory detail panels also allow temporary per-item hiding through `hiddenAdvisoryKeys`. That state is separate from the saved advisory filter settings.

## Operational Notes

- Alert settings are browser-local; they are not persisted to the backend.
- Alert trigger history is in-memory only and resets on page reload.
- Quiet hours suppress alert evaluation while active.
- Settings changes call back into `App.jsx` so live state updates without requiring a page reload.

## Superseded Source Notes

The following existing docs should be merged into this document and then archived or marked superseded:

- `Alert_System_Design.md`
- `Advisory_Filter_Design.md`
- minima notes currently duplicated in `AGENTS.md` and `README.md`
- traffic settings notes currently duplicated in `AGENTS.md` and `README.md`

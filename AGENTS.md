# AGENTS.md

This file is for autonomous coding agents working in this repository.
Follow it as the repo-local source of truth.

## Project Overview

- Name: KMA weather dashboard / aviation weather collector.
- Runtime: Node.js (backend scheduler + API server) and React + Vite (frontend).
- Entry points:
  - `server.js` (serves frontend + API passthrough endpoints).
  - `backend/src/index.js` (cron scheduler + data collection jobs).
- Data is persisted under `backend/data/` and served via `/data/*`.
- Additional current feeds include ADS-B aircraft positions (`backend/data/adsb/latest.json`).

## Rule Files Check

- No existing `AGENTS.md` was found before this file was created.
- No Cursor rules found:
  - No `.cursor/rules/`
  - No `.cursorrules`
- No Copilot instructions found:
  - No `.github/copilot-instructions.md`
- Existing style baseline comes from `.editorconfig` and current code patterns.

## Build, Run, and Test Commands

Use repo root unless noted.

### Install

- Root deps: `npm install`
- Frontend deps: `npm --prefix frontend install`

### Run

- Start scheduler only: `npm run start`
  - Runs `node backend/src/index.js`
- Start dashboard server (API + static): `npm run dashboard`
  - Runs `node server.js`
- Local dev (dashboard + Vite dev server): `npm run dev`

### Build

- Frontend production build: `npm --prefix frontend run build`
- Preview built frontend only: `npm --prefix frontend run preview`

### Test / Verification

- Main test script: `npm test`
  - Runs `node backend/test/run-once.js all`
- Run a single collector test target:
  - `node backend/test/run-once.js metar`
  - `node backend/test/run-once.js taf`
  - `node backend/test/run-once.js amos`
  - `node backend/test/run-once.js warning`
  - `node backend/test/run-once.js sigwx-low`
  - `node backend/test/run-once.js lightning`
  - `node backend/test/run-once.js radar-echo`
  - `node backend/test/run-once.js adsb`
  - `node backend/test/run-once.js ground-forecast`
  - `node backend/test/run-once.js satellite`
- Valid target values are enforced in `backend/test/run-once.js`.

### Lint / Format

- No dedicated lint command is currently configured in `package.json`.
- Frontend has `@biomejs/biome` as a dev dependency for local diagnostics/tooling.
- No Prettier/ESLint config is committed in this repo.
- Respect `.editorconfig` and existing formatting style manually.

## Formatting and Style Rules

Derived from `.editorconfig` + existing source files.

- Encoding: UTF-8
- EOL: LF
- Indentation: 2 spaces
- Insert final newline: yes
- Trim trailing whitespace: yes (except Markdown)
- Semicolons: required in JS/JSX files (follow existing pattern)
- Quotes:
  - Backend commonly uses double quotes
  - Frontend mostly uses double quotes for imports/strings
  - Keep local style consistent per file

## Architecture and Module Conventions

### Backend (`backend/src`)

- Module system: CommonJS (`require`, `module.exports`).
- File naming: kebab-case (e.g. `metar-processor.js`, `api-client.js`).
- Pattern:
  - Processors export `process()` or `processAll()`.
  - Parsers export pure parse helpers.
  - `config.js` is central runtime config.
  - `store.js` handles persistence/cache semantics.
- Scheduler lock pattern:
  - Use `runWithLock(type, job)` to avoid overlap.

### Frontend (`frontend/src`)

- Module system: ESM (`import` / `export`).
- Components: PascalCase file names and component names.
- Utils: lower-case helper files in `utils/`.
- Styling: centralized in `frontend/src/App.css`.

## Naming Conventions

- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for true constants
- Components/classes: `PascalCase`
- Data keys from APIs: preserve upstream naming if already established.
- Do not rename public payload keys casually (maintain backward compatibility).

## Imports and Dependency Use

- Keep imports grouped at top.
- Prefer relative imports consistent with neighboring files.
- Do not add new dependencies unless necessary.
- If adding a dependency, update the correct `package.json`:
  - Root for backend/runtime scripts
  - `frontend/package.json` for UI dependencies

## Error Handling Expectations

- Never swallow errors silently.
- Use structured fallbacks where this repo already does so:
  - Optional API reads return `null` in frontend (`fetchJsonOptional`).
  - Backend collectors may mark stale data and preserve previous payload.
- For retry logic, follow `backend/src/api-client.js` behavior:
  - bounded retries, timeout with AbortController, non-retryable classification.
- Keep error messages actionable and safe (avoid leaking secrets).

## Data and API Conventions

- API endpoints served by `server.js` under `/api/*`.
- Snapshot polling metadata is served at `/api/snapshot-meta`.
- `server.js` redirects `/` to `/ops` and serves SPA entry points for `/ops`, `/ground`, and `/test`.
- Static data served under `/data/*` from `backend/data`.
- `/test` may read static override JSON files from `frontend/public/test/` before falling back to live `/api/*` or `/data/*` responses.
- AMOS daily rainfall is served separately at `/api/amos` and stored under `backend/data/amos/latest.json`.
- Ground weekly forecast is served at `/api/ground-forecast` and stored under `backend/data/ground_forecast/latest.json`.
- SIGWX LOW is served at `/api/sigwx-low` and stored under `backend/data/sigwx_low/latest.json`.
- Persisted category files generally follow:
  - `backend/data/<type>/latest.json`
  - historical JSON files with prefixed timestamps.
- Radar echo uses image/meta outputs in `backend/data/radar/`.
- ADS-B latest aircraft state is stored at `backend/data/adsb/latest.json` and exposed at `/api/adsb`.
- GK2A satellite imagery is stored at `backend/data/satellite/sat_meta.json` + `sat_korea_{tm}.png` and served via `/data/satellite/*`. NetCDF(HDF5) files are parsed with `h5wasm` and reprojected from LCC to Web Mercator PNG.

## Agent Workflow Guidance

- Before edits:
  - Read target files fully.
  - Match surrounding style exactly.
  - Search for existing similar implementation first.
- After edits (minimum):
  - Run relevant targeted test command(s).
  - Run `npm --prefix frontend run build` for frontend changes.
  - For backend-only syntax checks, run focused node command when appropriate.
- Avoid unrelated refactors in feature/fix branches.

## Git Hygiene for Agents

- Do not commit generated artifacts from `backend/data/` unless explicitly requested.
- Do not commit secrets (`.env`, API keys).
- Keep commits focused and descriptive.
- If working tree contains unrelated user changes, do not revert them.

## Operational Notes

- Timezone handling frequently uses KST logic in collectors.
- SIGWX LOW `tmfc` is UTC-based and should follow the latest available cycle from the KMA `amo_sigwx.php` feed (`05/11/17/23 UTC` issue times; prefer probing the newest available cycle before falling back).
- Network calls use external KMA APIs; failures are expected and should degrade gracefully.
- Some collectors are intentionally independent (not all use `api-client.js`).
- ADS-B uses OpenSky `states/all` with two-stage filtering: (1) bounding-box query (`lat 30–39, lon 124–134`, covering Incheon FIR extent) and (2) point-in-polygon check against `rkrr_fir.geojson` outer ring (ray casting) to exclude aircraft outside the FIR boundary. If the FIR file is unavailable, the bbox result is used as-is.
- TLS fallback path exists for environments that surface `SELF_SIGNED_CERT_IN_CHAIN`.
- AMOS `RN` should be treated as daily rainfall; current dashboard polling reads it through the separate `amos` dataset rather than embedding it in METAR hashes.
- GK2A satellite uses KMA API (`typ05/api/GK2A/LE1B/{channel}/{region}/data`) plus LE2 FOG (`typ05/api/GK2A/LE2/{product}/{region}/data`) NetCDF4(HDF5) files. Default IR channel is `IR105`, FOG product is `FOG`, and region `KO` (Korea 900×900 @ 2km). The NC file uses the same LCC projection as radar echo (φ₁=30°, φ₂=60°, φ₀=38°, λ₀=126°) but with easting/northing coordinates.
- Satellite API requests use UTC `tm`, but stored/displayed `sat_meta.json` `tm` and `sat_korea_{tm}.png` filenames are KST-aligned. Latest request UTC is also persisted as `request_tm_utc`.
- Satellite IR background rendering now prefers a fixed brightness-temperature stretch (`190K..310K`) when the source values look like Kelvin, so warmer surfaces stay darker and colder cloud tops brighter across frames.
- Satellite fog overlay colors are matched to the KMA legend (`0 Fog -> red/orange/yellow -> 6 Lower Cloud green`) using interpolated display stops.
- `server.js` binds to `127.0.0.1`; expose externally via reverse proxy (nginx/LB), not direct app port.
- If nginx serves `frontend/dist` directly, keep both `.geojson` (`application/geo+json`) and `.topojson` (`application/topo+json`) MIME handling correct and enable gzip/brotli for `.geojson`, `.topojson`, `.json`, `.js`, and `.css`.
- InteractiveMap boundary detail is auto-switched by zoom (`zoom >= 9`: sigungu, `zoom < 9`: sido); there is no user setting toggle anymore.
- InteractiveMap renders nationwide lightning strikes in both Airport/Korea modes; Airport mode zone counters (8/16/32km) must remain based on selected-airport strikes.
- Lightning collection now uses a single nationwide fetch (`range_km: 800`, `itv_minutes: 5`), keeps a rolling 4-hour strike history in `backend/data/lightning/latest.json`, and filters the displayed strikes to the selected frame time minus 60 minutes.
- `node backend/test/run-once.js lightning` now uses the development-oriented 4-hour lightning backfill path; the scheduler still uses the normal incremental collector path.
- InteractiveMap `Traffic` layer is toggleable again and supports settings-driven callsign substring filtering plus altitude-band filtering (`baro_altitude` first, `geo_altitude` fallback, compare in feet after converting from meters). Altitude bands default to all 5 bands selected; an empty band selection hides all traffic (does not show all). Callsign filter empty = show all; any input = substring match only. Selections are persisted in `localStorage` keys `traffic_altitude_bands` and `traffic_callsign_filter`.
- InteractiveMap satellite overlay shares the radar timeline when both layers are enabled, uses full opacity, and switches coastline/administrative boundary strokes to yellow while satellite is visible.
- InteractiveMap `SIGWX_LOW` uses grouped rendering: contour items (`item_type 4`) are treated as primary regions, while label/icon items (`item_type 7/10/12`) are attached to the nearest matching region using contour/type context plus geometric matching.
- InteractiveMap `SIGWX_LOW` marker icons now use assets under `frontend/public/icon_sigwx/`. Phenomenon icons render without a white badge background; only meaningful sublabels remain as separate white chips. `freezing_level` uses `freezing_level.png` and is intentionally scaled larger than other SIGWX icons.
- InteractiveMap `SIGWX_LOW` no longer renders `font_line` (`fl_cold`, `fl_worm`, `fl_occl`) as normal GIS polylines. Front overlays are precomputed when `sigwx_low` is saved by `backend/src/processors/sigwx-low-processor.js` using `backend/src/parsers/sigwx-front-overlay.js`, stored as `fronts_<tmfc>.png` + `fronts_meta_<tmfc>.json`, and composited in the map with `ImageOverlay`.
- `SIGWX_LOW` CB cloud boundaries are also precomputed into scalloped PNG overlays by `backend/src/parsers/sigwx-cloud-overlay.js`, stored as `clouds_<tmfc>.png` + `clouds_meta_<tmfc>.json`, and shown with `ImageOverlay` instead of plain dashed GIS paths.
- `SIGWX_LOW` front/cloud overlays are `tmfc`-aware. When the user changes SIGWX history frame, the frontend reloads overlay metadata for the selected `tmfc`; if that snapshot has no `font_line` or no CB cloud boundary, the corresponding overlay is not shown.
- `SIGWX_LOW` arrow-like annotations currently derive direction from point order (`lat_lngs[0] -> lat_lngs[last]`), not from an explicit angle field in the parsed payload. This is used for selected `type 9/10` movement/pointer items only; `freezing_level` `type 10` labels are excluded from arrow rendering.
- `SIGWX_LOW` `type 4` cloud labels containing `CB` are not separate XML items. The parser now preserves `fpv.rect_label`, and CB text markers use `rect_label` first (fallback to `label_pos_pt + offset`) instead of simple polygon center placement.
- `SIGWX_LOW` panel labels add numbering for duplicate names (`SFC_VIS 1`, `SFC_VIS 2`, ...). `pressure`/`font_line` are grouped into a synthetic pressure-system toggle so hiding the pressure group also hides the related front overlay and speed arrows.
- `SIGMET`/`AIRMET` marker rendering now uses icon-first advisory markers instead of plain text badges. `SIGMET` motion-bearing phenomena render a larger arrow + speed text beside the icon, `AIRMET` `SFC_WIND` renders wind text inline inside the diamond icon, and other advisory types attach compact altitude/text chips below the icon.
- `SIGWX_LOW`, `SIGMET`, and `AIRMET` markers are zoom-aware. As the map zooms out, marker scale decreases and lower-priority text chips are suppressed to reduce overlap.
- `/ground` now replaces the METAR meta card with a dedicated current-weather card. The card uses METAR for current condition/wind, `ground_forecast` for today's high/low, existing helper computations for feels-like and humidity, and airport lat/lon for sunrise/sunset estimation. PM10/PM2.5 and UV data come from the `environment` processor (AirKorea + Open-Meteo + KMA UV API) collected every 10 minutes.
- `/ground` map panel hides SIGMET/AIRMET/SIGWX_LOW overlay buttons (keeps echo, satellite, lightning, traffic) and adds a "예보" tab next to 전국/공항. The satellite button label changes to "위성" in ground mode.
- `/ground` "예보" tab renders `TafForecastView` instead of the map. It shows the TAF timeline as a clickable segmented slider with a sweeping playhead animation (40s loop), TAF detail text, and a crossfading AI-generated airport weather image matched to the current TAF segment's weather condition and time of day.
- Airport weather images are pre-generated per airport using `scripts/generate-airport-weather-images.js` (Gemini API, `gemini-3.1-flash-image-preview`). 30 images per airport (3 time periods × 10 weather types) stored at `frontend/public/airport_weather/{ICAO}/{period}_{weather}.png`. Prompts are documented in `AIRPORT_AI_IMAGE_PROMPTS.md`.
- Switching the selected airport clears all active alert popups and the marquee banner immediately.
- `/ops` and `/ground` share the same selected-airport `localStorage` key (`selected_airport`). `/test` keeps its own separate key.
- `TafForecastView` timeline segments now render the same weather icons used by the main TAF timeline, plus a short condition label. Segment color is time-of-day only (`day` / `night`); the old `golden` variant is no longer used.
- Airport weather images are preloaded client-side for the active TAF segment set, and `/airport_weather/*` static responses use `Cache-Control: public, max-age=86400`.
- LIFR (airport-minima-breach) thresholds are now user-configurable in Settings > `MINIMA`; thresholds are persisted in `localStorage` key `airport_minima_settings` and must be passed into METAR/TAF category + visibility/ceiling tint classification helpers.
- Nationwide radar echo currently uses `cmp=hsr`, converts `dBZ` to `mm/h`, and reprojects to full radar-domain bounds before writing `/data/radar/echo_korea_<tm>.png`.
- In Korea mode, InteractiveMap draws a unioned KMA radar-coverage boundary from site radius metadata and can dim only the area outside that union boundary.
- Rain-rate colors follow the in-app `mm/h` legend, and sub-`0.1 mm/h` pixels should remain transparent so dark mode does not show a bright fringe.
- **Site-wide dark mode** is controlled by a single `mapTheme` state (`localStorage: "map_theme"`). When `mapTheme` changes, `document.documentElement.setAttribute("data-theme", mapTheme)` is called, toggling CSS variable overrides in `[data-theme="dark"]` block of `App.css`. The map tile filter (`.interactive-map-shell--dark`) follows automatically. The settings label is "사이트 테마" (was "지도 테마").
- `isDarkTheme()` is exported from `helpers.js` and used in `MetarCard.jsx` (`catColors()`, `getRvrEntryStyle()`) and `TafTimeline.jsx` (`getTintStyle()`, `getWeatherStyle()`) to select dark-aware inline styles for flight-category-tinted panels, since those colors are injected as inline styles and cannot be overridden by CSS variables alone.
- TAF timeline and table filter out expired hourly slots at render time: slots whose end time (`slot.time + 1h`) is already past `Date.now()` are removed before `groupElementsByValue` and `buildTafTableSegments` run, so remaining slots proportionally fill the full timeline width automatically. If all slots are expired, a "TAF 유효 기간이 만료됐습니다" message is shown.
- `TafTimeline` now maintains three view modes (`v2` timeline, `table`, `v3` grid) on top of a shared per-slot display model. Weather icon/label, wind alert, special-weather highlight, and minima-aware visibility/ceiling tint logic should be kept aligned across all three views instead of re-implementing them separately.
- `/test` hides the legacy `TST1` test airport from the selector, uses real airports backed by `frontend/public/test/*` snapshots when present, and bypasses the expired-slot TAF filter so snapshot timelines remain visible regardless of current time.
- TAF `table` view reuses the same outer `taf-new-panel` shell as timeline view and keeps the timeline-oriented minimum panel height, so toggling between timeline/table should not change the overall left-column panel stack height or right map panel height.
- A FOUC-prevention inline script in `frontend/index.html` applies `data-theme` before React mounts.
- METAR `현재 날씨` title icon now uses files under `frontend/public/gisang-i/`. Mapping rule: thunder (`TS/TSRA`) -> `TS.png`, snow (`SN` variants) -> `SN.png`, rain/drizzle/showers (`RA`, `DZ`, `SHRA` variants) -> `RN_DZ.png`, otherwise clear-set rotation. Clear rotation is date-based within the active timezone, includes the matching seasonal clear image in the candidate pool, and forces `clear_christmas.png` on December 24-25.
- `/ground` replaces the TAF panel with a 7-day AM/PM weekly forecast panel backed by `ground_forecast`. Data is composed from KMA `getLandFcst`, `getMidLandFcst`, and `getMidTa`, scheduled at `30 6,11,18,23 * * *`, and uses partial-source fallback plus previous-payload preservation on degraded fetches.
- In PowerShell, Korean UTF-8 files may render incorrectly with plain `Get-Content`.
- When reading Korean text files, prefer explicit UTF-8 decoding:
  - `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
  - `[System.IO.File]::ReadAllText("PATH", [System.Text.Encoding]::UTF8)`

## Quick Checklist Before Finalizing

- [ ] Commands in docs still match `package.json` and test runner.
- [ ] New code follows 2-space indent + semicolon style.
- [ ] Backend remains CommonJS; frontend remains ESM.
- [ ] No hidden breaking payload changes.
- [ ] Frontend build passes when UI touched.
- [ ] Relevant collector/test command executed for backend changes.

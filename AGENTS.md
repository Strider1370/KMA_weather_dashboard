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
- `server.js` also serves SPA entry points for both `/` and `/test`.
- Static data served under `/data/*` from `backend/data`.
- AMOS daily rainfall is served separately at `/api/amos` and stored under `backend/data/amos/latest.json`.
- SIGWX LOW is served at `/api/sigwx-low` and stored under `backend/data/sigwx_low/latest.json`.
- Persisted category files generally follow:
  - `backend/data/<type>/latest.json`
  - historical JSON files with prefixed timestamps.
- Radar echo uses image/meta outputs in `backend/data/radar/`.
- ADS-B latest aircraft state is stored at `backend/data/adsb/latest.json` and exposed at `/api/adsb`.

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
- `server.js` binds to `127.0.0.1`; expose externally via reverse proxy (nginx/LB), not direct app port.
- If nginx serves `frontend/dist` directly, keep both `.geojson` (`application/geo+json`) and `.topojson` (`application/topo+json`) MIME handling correct and enable gzip/brotli for `.geojson`, `.topojson`, `.json`, `.js`, and `.css`.
- InteractiveMap boundary detail is auto-switched by zoom (`zoom >= 9`: sigungu, `zoom < 9`: sido); there is no user setting toggle anymore.
- InteractiveMap renders nationwide lightning strikes in both Airport/Korea modes; Airport mode zone counters (8/16/32km) must remain based on selected-airport strikes.
- InteractiveMap `Traffic` layer is toggleable again and supports settings-driven callsign substring filtering plus altitude-band filtering (`baro_altitude` first, `geo_altitude` fallback, compare in feet after converting from meters). Altitude bands default to all 5 bands selected; an empty band selection hides all traffic (does not show all). Callsign filter empty = show all; any input = substring match only. Selections are persisted in `localStorage` keys `traffic_altitude_bands` and `traffic_callsign_filter`.
- InteractiveMap `SIGWX_LOW` uses grouped rendering: contour items (`item_type 4`) are treated as primary regions, while label/icon items (`item_type 7/10/12`) are attached to the nearest matching region using contour/type context plus geometric matching.
- Switching the selected airport clears all active alert popups and the marquee banner immediately.
- LIFR (airport-minima-breach) thresholds are now user-configurable in Settings > `MINIMA`; thresholds are persisted in `localStorage` key `airport_minima_settings` and must be passed into METAR/TAF category + visibility/ceiling tint classification helpers.
- Nationwide radar echo currently uses `cmp=hsr`, converts `dBZ` to `mm/h`, and reprojects to full radar-domain bounds before writing `/data/radar/echo_korea_<tm>.png`.
- In Korea mode, InteractiveMap draws a unioned KMA radar-coverage boundary from site radius metadata and can dim only the area outside that union boundary.
- Rain-rate colors follow the in-app `mm/h` legend, and sub-`0.1 mm/h` pixels should remain transparent so dark mode does not show a bright fringe.
- **Site-wide dark mode** is controlled by a single `mapTheme` state (`localStorage: "map_theme"`). When `mapTheme` changes, `document.documentElement.setAttribute("data-theme", mapTheme)` is called, toggling CSS variable overrides in `[data-theme="dark"]` block of `App.css`. The map tile filter (`.interactive-map-shell--dark`) follows automatically. The settings label is "사이트 테마" (was "지도 테마").
- `isDarkTheme()` is exported from `helpers.js` and used in `MetarCard.jsx` (`catColors()`, `getRvrEntryStyle()`) and `TafTimeline.jsx` (`getTintStyle()`, `getWeatherStyle()`) to select dark-aware inline styles for flight-category-tinted panels, since those colors are injected as inline styles and cannot be overridden by CSS variables alone.
- TAF timeline and table filter out expired hourly slots at render time: slots whose end time (`slot.time + 1h`) is already past `Date.now()` are removed before `groupElementsByValue` and `buildTafTableSegments` run, so remaining slots proportionally fill the full timeline width automatically. If all slots are expired, a "TAF 유효 기간이 만료됐습니다" message is shown.
- A FOUC-prevention inline script in `frontend/index.html` applies `data-theme` before React mounts.
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

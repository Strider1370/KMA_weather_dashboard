# Docs Inventory

Status: Working inventory for the docs cleanup, current as of 2026-05-02.

This file started as the pre-archive inventory for `docs/`. Archive decisions are recorded below so the original rows can still explain why each document was moved, merged, or kept.

## Cleanup Assumptions

- `tmp/` remains untracked and untouched.
- First cleanup pass prefers archiving over deletion unless a document is clearly scratch material.
- Final current-state docs should be Korean-first, matching the current `README.md`, with English file names kept for maintainability.
- Mermaid diagrams are allowed where they clarify architecture, but text should remain the primary source of truth.

## Inventory Table

| File | Size | Modified | Topic | Type | Status | Related Code / Surface | Recommended Action | Notes |
|---|---:|---|---|---|---|---|---|---|
| `ads-b.md` | 16,511 | 2026-03-27 21:37:18 | ADS-B and flight/callsign API research | feature design / ops note | partial | `backend/src/processors/adsb-processor.js`, `server.js`, `frontend/src/components/InteractiveMap.jsx`, `frontend/src/utils/api.js` | merge + archive | Current implementation uses OpenSky ADS-B; airport corporation flight API notes look historical/research-oriented. |
| `Advisory_Filter_Design.md` | 9,184 | 2026-04-07 22:27:54 | SIGMET/AIRMET/SIGWX filters | feature design | partial | `frontend/src/utils/advisory-filter.js`, `frontend/src/components/alerts/Settings.jsx`, `frontend/src/components/InteractiveMap.jsx` | merge | Fold current settings/filter behavior into `alerts-and-settings.md`; archive detailed design if still useful. |
| `alerts-and-settings.md` | 7,273 | 2026-05-02 12:46:00 | alert engine, settings modal, traffic/minima/advisory filters | feature design / ops note | current | `shared/alert-defaults.js`, `frontend/src/components/alerts/Settings.jsx`, `frontend/src/utils/alerts/`, `frontend/src/utils/advisory-filter.js`, `frontend/src/utils/helpers.js`, `frontend/src/components/InteractiveMap.jsx` | keep | New current-state alerts/settings document created during cleanup. |
| `Airport_Weather_Forecast_View.md` | 6,033 | 2026-04-05 15:38:03 | `/ground` forecast image view | feature design | current-ish | `frontend/src/components/TafForecastView.jsx`, `scripts/generate-airport-weather-images.js`, `frontend/public/airport_weather/`, `frontend/src/App.jsx` | merge | Merge into `frontend-dashboard.md`; verify current `/ground` also uses 7-day forecast panel. |
| `Alert_System_Design.md` | 8,381 | 2026-04-09 00:06:20 | alert engine, popups, sound, settings | feature design | current-ish | `frontend/src/utils/alerts/`, `frontend/src/components/alerts/`, `frontend/src/App.jsx` | merge | Good base for `alerts-and-settings.md`; verify triggers and localStorage keys. |
| `Basmilius_Weather_Icon_Adoption_Plan.md` | 17,030 | 2026-03-24 18:51:54 | weather icon adoption plan | historical plan | partial | `frontend/src/components/WeatherIcon.jsx`, `frontend/src/utils/weather-icon-registry.js`, `frontend/src/utils/weather-visual-resolver.js`, `frontend/public/gisang-i/` | merge + archive | Current METAR title icon rule uses `gisang-i`; broader Basmilius plan may be superseded. |
| `darkmode.md` | 14,624 | 2026-03-27 13:29:10 | site-wide dark mode | feature design | partial/current | `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/index.html`, `frontend/src/utils/helpers.js` | merge | Merge current behavior into `frontend-dashboard.md`; archive implementation plan details. |
| `README.md` | 4,171 | 2026-05-02 12:21:23 | docs entry point and target structure | architecture / ops note | current | docs cleanup task, current docs navigation | keep | New current-state docs index created during cleanup. |
| `architecture.md` | 5,596 | 2026-05-02 12:20:53 | runtime architecture, API, scheduler, storage, frontend data flow | architecture | current | `server.js`, `backend/src/index.js`, `backend/src/config.js`, `backend/src/store.js`, `frontend/src/utils/api.js` | keep | New current-state architecture document created during cleanup. |
| `backend-collectors.md` | 5,712 | 2026-05-02 12:23:36 | backend collectors, schedules, parser/renderer ownership | architecture / ops note | current | `backend/src/processors/`, `backend/src/parsers/`, `backend/src/config.js`, `backend/src/store.js` | keep | New current-state collector document created during cleanup. |
| `frontend-dashboard.md` | 12,082 | 2026-05-02 12:34:00 | frontend routes, desktop/mobile dashboards, theme, forecast/current-weather panels | architecture / feature design | current | `frontend/src/App.jsx`, `frontend/src/utils/route-mode.js`, `frontend/src/utils/api.js`, `frontend/src/components/MetarCard.jsx`, `frontend/src/components/TafTimeline.jsx`, `frontend/src/components/GroundCurrentWeatherCard.jsx`, `frontend/src/components/GroundForecastPanel.jsx`, `frontend/src/components/TafForecastView.jsx` | keep | New current-state frontend document created during cleanup. |
| `map-overlays.md` | 10,595 | 2026-05-02 12:38:00 | map scopes, radar/satellite/lightning/traffic/advisory overlays, timeline, pane order | feature design / architecture | current | `frontend/src/components/InteractiveMap.jsx`, `frontend/src/utils/sigwx.js`, `frontend/src/utils/advisory-filter.js`, `backend/src/processors/radar-echo-processor.js`, `backend/src/processors/satellite-processor.js`, `backend/src/processors/lightning-processor.js`, `backend/src/processors/adsb-processor.js`, `backend/src/processors/sigwx-low-processor.js` | keep | New current-state map overlay document created during cleanup. |
| `weather-parsing.md` | 9,085 | 2026-05-02 12:42:00 | METAR/TAF/warning/advisory/SIGWX parsing and frontend display mapping boundary | parser algorithm / architecture | current | `backend/src/parsers/parse-utils.js`, `backend/src/parsers/metar-parser.js`, `backend/src/parsers/taf-parser.js`, `backend/src/parsers/warning-parser.js`, `backend/src/parsers/iwxxm-advisory-parser.js`, `backend/src/parsers/sigwx-low-parser.js`, `frontend/src/utils/visual-mapper.js` | keep | New current-state parser summary created during cleanup. |
| `docs-cleanup-plan.md` | 11,503 | 2026-05-02 12:13:58 | docs cleanup working guide | ops note | current | docs cleanup task | keep | Live plan and checklist for this cleanup. |
| `docs-inventory.md` | 12,308 | 2026-05-02 12:18:59 | docs inventory and cleanup classification | ops note | current | docs cleanup task | keep | New working inventory created during cleanup; update as files move or status changes. |
| `ground-forecast-design.md` | 4,097 | 2026-04-03 19:39:17 | 7-day ground forecast collection | feature design | current-ish | `backend/src/processors/ground-forecast-processor.js`, `backend/src/config.js`, `frontend/src/components/GroundForecastPanel.jsx`, `server.js` | merge | Split backend collection notes into `backend-collectors.md` and UI notes into `frontend-dashboard.md`. |
| `Lightning_Data_Design.md` | 11,040 | 2026-04-02 23:15:26 | nationwide lightning collection/history | feature design | current-ish | `backend/src/processors/lightning-processor.js`, `backend/src/parsers/lightning-parser.js`, `frontend/src/components/InteractiveMap.jsx` | merge | Merge collector details into `backend-collectors.md`; map behavior into `map-overlays.md`. |
| `map.md` | 7,795 | 2026-02-23 00:49:22 | old LightningMap boundary implementation | historical plan | stale | `frontend/src/components/InteractiveMap.jsx`, `frontend/public/geo/`, `scripts/generate-boundary-topojson.js` | archive | Mentions old `LightningMap.jsx` structure; current map is `InteractiveMap.jsx`. |
| `METAR_Parsing_Algorithm.md` | 20,834 | 2026-02-23 00:49:22 | METAR parser model | parser algorithm | pending full re-verification | `backend/src/parsers/metar-parser.js`, `backend/src/processors/metar-processor.js`, `frontend/src/components/MetarCard.jsx` | keep as marked appendix for now | Large algorithm doc; status note added. Prefer `weather-parsing.md` and current code on conflict. |
| `mobile-ops-layout-plan.md` | 7,397 | 2026-04-27 00:50:57 | mobile `/ops` layout | feature design | current-ish | `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/src/components/MetarCard.jsx`, `frontend/src/components/TafTimeline.jsx`, `frontend/src/components/InteractiveMap.jsx` | merge | Merge into `frontend-dashboard.md`; keep only current behavior. |
| `new project.md` | 1,560 | 2026-04-27 01:00:29 | vague project/task note | scratch | unknown | unknown | review for delete/archive | No heading detected; likely scratch. Read fully before removal. |
| `operations.md` | 6,702 | 2026-05-02 12:50:00 | run/build/test/deploy/security/troubleshooting operations | ops note | current | `package.json`, `server.js`, root `README.md`, `docs/security-hardening-plan.md`, `docs/rate-limit-and-radar-loop-notes.md` | keep | New current-state operations document created during cleanup. |
| `radar_binary_lightning_overlay_design.md` | 5,690 | 2026-02-23 00:49:22 | radar binary overlay on old map | historical plan | stale/partial | `backend/src/parsers/radar-echo-parser.js`, `backend/src/processors/radar-echo-processor.js`, `frontend/src/components/InteractiveMap.jsx` | merge + archive | Use current radar binary facts in `backend-collectors.md` and `map-overlays.md`; archive old LightningMap-specific parts. |
| `radar_image_design_v_2_overlay_div.md` | 5,630 | 2026-02-23 00:49:22 | radar image DIV overlay | historical plan | stale/partial | `backend/src/processors/radar-echo-processor.js`, `frontend/src/components/InteractiveMap.jsx` | merge + archive | Superseded by Leaflet image overlays and current radar timeline behavior. |
| `rate-limit-and-radar-loop-notes.md` | 3,899 | 2026-03-11 22:50:00 | polling load and radar loop notes | ops note | partial | `frontend/src/utils/api.js`, `frontend/src/components/InteractiveMap.jsx`, `server.js`, `backend/src/store.js` | merge | Relevant to architecture/polling; verify current snapshot-meta behavior. |
| `satellite_overlay_design.md` | 13,706 | 2026-03-29 15:56:39 | GK2A satellite overlay | feature design | current-ish | `backend/src/processors/satellite-processor.js`, `backend/src/parsers/satellite-parser.js`, `frontend/src/components/InteractiveMap.jsx` | merge | Split collection/rendering and frontend overlay behavior across `backend-collectors.md` and `map-overlays.md`. |
| `Scheduler_Cache_Design.md` | 6,838 | 2026-02-23 00:49:22 | scheduler, store, hashes | architecture / ops note | partial | `backend/src/index.js`, `backend/src/store.js`, `backend/src/config.js`, `server.js` | merge | Merge into `architecture.md` and `backend-collectors.md`; verify schedules first. |
| `security-hardening-plan.md` | 4,073 | 2026-03-12 05:53:25 | public dashboard hardening | ops note / historical plan | unknown/partial | `server.js`, deployment/nginx notes, env handling | keep or merge | Could become a section in `operations.md`; verify current headers/CORS/bind behavior. |
| `SIGMET_AIRMET_Design.md` | 12,464 | 2026-03-23 22:33:14 | SIGMET/AIRMET parsing and rendering | feature design | partial/current | `backend/src/processors/sigmet-processor.js`, `backend/src/processors/airmet-processor.js`, `backend/src/parsers/iwxxm-advisory-parser.js`, `frontend/src/components/InteractiveMap.jsx` | merge or keep dedicated | Current marker rendering has evolved; verify before deciding dedicated vs `map-overlays.md`. |
| `SIGWX_LOW_Design.md` | 12,596 | 2026-04-04 11:11:07 | SIGWX_LOW collection/parsing/rendering | feature design | partial/current | `backend/src/processors/sigwx-low-processor.js`, `backend/src/parsers/sigwx-low-parser.js`, `backend/src/parsers/sigwx-front-overlay.js`, `backend/src/parsers/sigwx-cloud-overlay.js`, `frontend/src/components/InteractiveMap.jsx` | merge or keep dedicated | Important and still active; needs update for tmfc-aware front/cloud PNG overlays. |
| `snapshot-meta-polling-plan.md` | 4,750 | 2026-03-11 22:50:00 | snapshot metadata polling | architecture / feature design | partial/current | `server.js`, `frontend/src/utils/api.js`, `frontend/src/App.jsx`, `backend/src/store.js` | merge | Merge into `architecture.md` or `frontend-dashboard.md` after verifying current polling loop. |
| `Stats_Design.md` | 12,873 | 2026-02-23 00:49:22 | API collection failure stats | feature design / ops note | partial/stale | `backend/src/stats.js`, `frontend/src/components/StatsPanel.jsx`, `server.js` | merge + archive | Runtime stats are persisted by the scheduler, but current `server.js` does not expose `/api/stats` and current `App.jsx` does not render `StatsPanel`. Current notes are in `backend-collectors.md` and `operations.md`. |
| `TAF_Hourly_Resolution_Algorithm.md` | 52,882 | 2026-02-23 00:49:22 | TAF hourly resolution algorithm | parser algorithm | pending full re-verification | `backend/src/parsers/taf-parser.js`, `frontend/src/components/TafTimeline.jsx` | keep as marked appendix for now | Largest doc; status note added. Prefer `weather-parsing.md` and current code on conflict. |
| `Visualization.md` | 16,495 | 2026-02-23 00:49:22 | old METAR sidebar and TAF visualization | feature design | stale/partial | `frontend/src/components/MetarCard.jsx`, `frontend/src/components/TafTimeline.jsx`, `frontend/src/App.jsx` | merge + archive | Mentions older component names; extract still-current display rules into `frontend-dashboard.md`. |
| `Warning_Parsing_Algorithm.md` | 10,500 | 2026-02-23 00:49:22 | warning parser model | parser algorithm | pending full re-verification | `backend/src/parsers/warning-parser.js`, `backend/src/processors/warning-processor.js`, `frontend/src/components/WarningList.jsx` | keep as marked appendix for now | Status note added. Prefer `weather-parsing.md` and current code on conflict. |
| `Weather_Visualization_Mapping.md` | 17,693 | 2026-02-23 00:49:22 | weather visual/icon mapping | feature design / parser-adjacent | partial | `frontend/src/utils/visual-mapper.js`, `frontend/src/utils/weather-icon-registry.js`, `frontend/src/utils/weather-visual-resolver.js`, `frontend/src/components/WeatherIcon.jsx`, `frontend/public/gisang-i/` | merge + archive | Current icon system should be summarized in `frontend-dashboard.md` or `weather-parsing.md`. |

## Obvious Overlap Groups

- Map overlays: `map.md`, `radar_binary_lightning_overlay_design.md`, `radar_image_design_v_2_overlay_div.md`, `Lightning_Data_Design.md`, `satellite_overlay_design.md`, `SIGWX_LOW_Design.md`, `SIGMET_AIRMET_Design.md`, `ads-b.md`.
- Parsing algorithms: `METAR_Parsing_Algorithm.md`, `TAF_Hourly_Resolution_Algorithm.md`, `Warning_Parsing_Algorithm.md`, parts of `SIGMET_AIRMET_Design.md`, parts of `SIGWX_LOW_Design.md`.
- Frontend dashboard behavior: `Visualization.md`, `mobile-ops-layout-plan.md`, `darkmode.md`, `Airport_Weather_Forecast_View.md`, `Weather_Visualization_Mapping.md`, `Basmilius_Weather_Icon_Adoption_Plan.md`.
- Backend collectors and persistence: `Scheduler_Cache_Design.md`, `snapshot-meta-polling-plan.md`, `Stats_Design.md`, `ground-forecast-design.md`, `Lightning_Data_Design.md`, `satellite_overlay_design.md`, radar documents.
- Alerts/settings: `Alert_System_Design.md`, `Advisory_Filter_Design.md`, minima and traffic settings notes currently documented mostly in `AGENTS.md`/`README.md`.

## Initial Target Structure Recommendation

Use the structure from `docs/docs-cleanup-plan.md` with one adjustment: keep very large parser algorithms as dedicated appendix documents if verification shows they are still mostly accurate.

```text
docs/
  README.md
  architecture.md
  backend-collectors.md
  frontend-dashboard.md
  map-overlays.md
  weather-parsing.md
  alerts-and-settings.md
  operations.md
  archive/
```

Potential appendices:

- `docs/metar-parsing.md`
- `docs/taf-hourly-resolution.md`
- `docs/warning-parsing.md`

## Archive Pass 2026-05-02

Moved to `docs/archive/superseded/` after merging current behavior into top-level docs:

- `Advisory_Filter_Design.md`
- `Airport_Weather_Forecast_View.md`
- `Alert_System_Design.md`
- `Basmilius_Weather_Icon_Adoption_Plan.md`
- `darkmode.md`
- `ground-forecast-design.md`
- `Lightning_Data_Design.md`
- `map.md`
- `mobile-ops-layout-plan.md`
- `radar_binary_lightning_overlay_design.md`
- `radar_image_design_v_2_overlay_div.md`
- `rate-limit-and-radar-loop-notes.md`
- `satellite_overlay_design.md`
- `Scheduler_Cache_Design.md`
- `security-hardening-plan.md`
- `SIGMET_AIRMET_Design.md`
- `SIGWX_LOW_Design.md`
- `snapshot-meta-polling-plan.md`
- `Stats_Design.md`
- `Visualization.md`
- `Weather_Visualization_Mapping.md`

Moved to `docs/archive/research/`:

- `ads-b.md`
- `new project.md`

Kept at top level for a later parser-specific verification pass:

- `METAR_Parsing_Algorithm.md`
- `TAF_Hourly_Resolution_Algorithm.md`
- `Warning_Parsing_Algorithm.md`

## Next Verification Targets

1. Check commands and schedules against `package.json` and `backend/src/config.js`.
2. Check API endpoints against `server.js`.
3. Check route/mobile behavior against `frontend/src/App.jsx`.
4. Check map overlay behavior against `frontend/src/components/InteractiveMap.jsx`.
5. Check parser algorithm docs against `backend/src/parsers/`.

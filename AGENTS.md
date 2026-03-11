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
  - `node backend/test/run-once.js warning`
  - `node backend/test/run-once.js lightning`
  - `node backend/test/run-once.js radar-echo`
- Valid target values are enforced in `backend/test/run-once.js`.

### Lint / Format

- No dedicated lint command is currently configured in `package.json`.
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
- Static data served under `/data/*` from `backend/data`.
- Persisted category files generally follow:
  - `backend/data/<type>/latest.json`
  - historical JSON files with prefixed timestamps.
- Radar echo uses image/meta outputs in `backend/data/radar/`.

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
- Network calls use external KMA APIs; failures are expected and should degrade gracefully.
- Some collectors are intentionally independent (not all use `api-client.js`).
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

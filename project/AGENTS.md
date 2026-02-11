# Repository Guidelines

## Project Structure & Module Organization
The working application lives under `project/`.
- `backend/src/`: data collection and processing (`processors/`, `parsers/`, `config.js`, `store.js`, scheduler in `index.js`).
- `backend/test/run-once.js`: smoke runner for one-shot pipeline execution.
- `frontend/src/`: React UI (`components/`, `utils/alerts/`, `App.jsx`).
- `frontend/server.cjs`: API + static server used by `npm run dev` and `npm run dashboard`.
- `shared/`: shared constants (`airports.js`, `warning-types.js`, `alert-defaults.js`).
- `docs/`: design/algorithm documents.
- Runtime outputs: `backend/data/{metar,taf,warning,lightning,radar}/` and test overlay `backend/data/TST1/`.

## Build, Test, and Development Commands
Run from `project/` unless noted.
- `npm install` and `npm --prefix frontend install`: install root/frontend dependencies.
- `npm run dev`: starts API server (`5173`) and Vite dev server (`5174`).
- `npm run dashboard`: production-style server (`frontend/server.cjs`).
- `npm start`: backend scheduler only.
- `npm test`: run all collectors once (`metar/taf/warning/lightning/radar`).
- `node backend/test/run-once.js metar` (or `taf|warning|lightning|radar|all`): targeted smoke run.
- `npm --prefix frontend run build`: build frontend assets.

## Coding Style & Naming Conventions
- Use 2-space indentation and semicolons.
- Backend uses CommonJS (`require`, `module.exports`); frontend uses ESM.
- File naming: kebab-case for backend modules (e.g., `radar-processor.js`), PascalCase for React components (e.g., `RadarPanel.jsx`).
- Keep parser logic and processor orchestration separated.

## Testing Guidelines
There is no formal unit-test framework yet; use smoke validation.
- Before PRs: run `npm test` and verify updated `latest.json` / radar metadata.
- For UI changes: run `npm --prefix frontend run build`.
- If adding non-trivial logic, include reproducible validation steps in PR notes.

## Commit & Pull Request Guidelines
Prefer Conventional Commit prefixes:
- `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`.
Keep subjects short and scoped to one change.

PRs should include:
- What changed and why.
- Affected paths (example: `backend/src/processors/*`, `frontend/src/components/*`).
- Local verification commands and outcomes.
- Screenshots/GIFs for UI updates.

## Security & Configuration Tips
- Store secrets in `.env` (`API_AUTH_KEY`; optional URL overrides).
- Do not commit keys or raw secret values.
- `DATA_PATH` is resolved from project root; default is `backend/data`.
- `frontend/server.js` is legacy; use `frontend/server.cjs`.

# Docs Cleanup Plan

This document is the working guide for reorganizing and refreshing `docs/`.
Use it to keep the cleanup consistent across multiple sessions.

## Resume Instructions

When resuming this task after context compaction or in a new session:

1. Read `AGENTS.md`.
2. Read `README.md`.
3. Read this file: `docs/docs-cleanup-plan.md`.
4. Check `git status --short`.
5. Continue from the first unchecked item in `Detailed Work Checklist`.
6. Do not modify, stage, or delete `tmp/` unless explicitly requested.
7. Before committing, inspect the final diff and confirm that stale docs are either updated, archived, deleted, or clearly marked.

## Goal

- Make `docs/` reflect the current project instead of historical implementation notes.
- Merge overlapping design notes into stable topic documents where practical.
- Archive or delete documents that no longer help maintain or operate the project.
- Preserve useful history without letting stale plans look like current behavior.

## Non-Goals

- Do not rewrite product behavior or code while cleaning docs unless explicitly requested.
- Do not delete historical design context before it has been classified.
- Do not commit generated runtime data from `backend/data/`.
- Do not treat old docs as source of truth when code and README/AGENTS disagree.

## Source Of Truth Order

When a doc conflicts with implementation, use this order:

1. Current code and committed assets.
2. `AGENTS.md` operational notes.
3. `README.md` user-facing project overview.
4. Existing `docs/` documents.
5. Historical notes, temporary files, and uncommitted scratch material.

If code behavior is unclear, mark the section as `Needs verification` instead of guessing.

## Working Rules

- Read each document before moving, merging, or deleting it.
- Search for related code before deciding whether a document is stale.
- Prefer archiving over deletion during the first cleanup pass.
- Keep final current-state documents concise and navigable.
- Move detailed obsolete plans into `docs/archive/` only if they still explain why the project is shaped a certain way.
- Add a short status note to any retained historical document, for example:
  - `Status: Historical plan, partially implemented.`
  - `Status: Current as of YYYY-MM-DD.`
  - `Status: Superseded by docs/map-overlays.md.`
- Avoid duplicating the same current behavior across many documents. Link instead.
- Use UTF-8 explicit reads in PowerShell for Korean text:
  - `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -Raw -Encoding UTF8 "PATH"`

## Verification Log

- 2026-05-02 preflight check before `frontend-dashboard.md`:
  - `docs/` file list and `docs/docs-inventory.md` now both contain 31 files.
  - Markdown links in current working docs resolve.
  - API endpoints in `docs/architecture.md` were checked against `server.js`.
  - Collector schedules and processor/parser file paths in `docs/backend-collectors.md` were checked against `backend/src/config.js`, `backend/src/processors/`, `backend/src/parsers/`, and `backend/test/run-once.js`.
  - `tmp/iwxxm-wmo/` remains untracked and untouched.
- 2026-05-02 archive pass check:
  - Superseded/research docs were moved into `docs/archive/`; no docs were deleted.
  - Moved archive file contents match the corresponding `HEAD:docs/...` blobs.
  - Markdown links under `docs/` resolve.
  - Current-state docs all have `Status:` lines.
  - `npm --prefix frontend run build` passed after retrying outside the sandbox because the first sandboxed run failed with esbuild `spawn EPERM`.
  - `tmp/iwxxm-wmo/` remains untracked and untouched.

## Detailed Work Checklist

Use this checklist as the live progress tracker. Update it as each step is completed.

### 0. Preparation

- [x] Confirm whether `tmp/` and other scratch directories should stay untracked, be ignored, or be deleted.
  - Assumption for this pass: leave `tmp/` untracked and untouched.
- [x] Confirm whether historical docs should be archived by default or deleted when obsolete.
  - Assumption for this pass: archive by default; delete only clear scratch after review.
- [x] Confirm final documentation language preference: English, Korean, or mixed.
  - Assumption for this pass: Korean-first current-state docs, English filenames.
- [x] Confirm whether final docs should include Mermaid diagrams.
  - Assumption for this pass: Mermaid is allowed when useful, but text remains primary.
- [x] Check current git status and note unrelated changes before editing docs.
  - Current status before inventory edits: `?? docs/docs-cleanup-plan.md`, `?? tmp/`.

### 1. Inventory

- [x] List every file under `docs/`.
- [x] Capture file size and last modified date for each doc.
- [x] Read each document title, intro, and heading structure.
- [x] Create `docs/docs-inventory.md` or an inventory section in this file.
- [x] Assign each document a topic.
- [x] Assign each document a type:
  - architecture
  - feature design
  - parser algorithm
  - ops note
  - historical plan
  - scratch
- [x] Assign each document an initial status:
  - current
  - stale
  - partial
  - unknown
- [x] Record obvious duplicate/overlapping documents.

### 2. Code Mapping

- [x] Map every document to likely code owners or runtime surfaces.
- [x] Search for key feature names from each document in the repo.
- [x] Record related files for each document.
- [x] Mark documents with no matching implementation as `historical`, `planned`, or `scratch`.
  - Initial classification is recorded in `docs/docs-inventory.md`; ambiguous docs remain `unknown` until full verification.
- [x] Mark documents whose implementation clearly changed as `stale` or `partial`.
  - Initial classification is recorded in `docs/docs-inventory.md`; parser-heavy docs require deeper verification before final disposition.

### 3. Target Structure Decision

- [x] Decide whether to use the preferred target structure below.
  - Decision: use the preferred target structure, documented in `docs/README.md`.
- [x] Decide whether large algorithm docs stay separate or are summarized into topic docs.
  - Decision: summarize in `weather-parsing.md`; keep dedicated appendices only if verification shows the large parser docs are still mostly accurate.
- [x] Decide archive folder layout:
  - `docs/archive/`
  - `docs/archive/old-plans/`
  - `docs/archive/superseded/`
  - Decision: use `docs/archive/superseded/` for replaced design notes and `docs/archive/research/` for useful research/scratch context; create folders during archive pass.
- [x] Draft the final `docs/README.md` table of contents.
- [x] Review target filenames for consistency and clarity.

### 4. Current-State Document Drafting

- [x] Draft or update `docs/README.md`.
- [x] Draft or update `docs/architecture.md`.
- [x] Draft or update `docs/backend-collectors.md`.
- [x] Draft or update `docs/frontend-dashboard.md`.
- [x] Draft or update `docs/map-overlays.md`.
- [x] Draft or update `docs/weather-parsing.md`.
- [x] Draft or update `docs/alerts-and-settings.md`.
- [x] Draft or update `docs/operations.md`.
- [x] Add `Status: Current as of YYYY-MM-DD.` to current-state docs.

### 5. Merge Existing Docs

- [x] Merge radar-related notes into `map-overlays.md` or archive them.
- [x] Merge lightning notes into `map-overlays.md` or `backend-collectors.md`.
- [x] Merge satellite overlay notes into `map-overlays.md` and `backend-collectors.md`.
- [x] Merge mobile `/ops` notes into `frontend-dashboard.md`.
- [x] Merge dark mode notes into `frontend-dashboard.md`.
- [x] Merge ground forecast notes into `frontend-dashboard.md` and `backend-collectors.md`.
- [x] Merge airport forecast image notes into `frontend-dashboard.md`.
- [x] Merge alert/advisory/minima notes into `alerts-and-settings.md`.
- [x] Merge snapshot polling notes into `architecture.md` or `frontend-dashboard.md`.
- [x] Merge scheduler/cache notes into `backend-collectors.md` or `architecture.md`.
- [x] Merge runtime stats notes into `backend-collectors.md` and `operations.md`.
- [x] Decide whether METAR/TAF/WARNING parser docs remain separate or become `weather-parsing.md`.
- [x] Decide whether SIGWX_LOW and SIGMET/AIRMET remain separate or become sections of `map-overlays.md`.
- [x] Decide whether ADS-B remains separate or becomes a section of `map-overlays.md` and `backend-collectors.md`.

### 6. Archive/Delete Pass

- [x] Add archive index notes before/while archiving.
- [x] Move superseded but useful documents into `docs/archive/`.
- [x] Archive scratch/research documents instead of deleting them.
- [x] Search the repo for references to moved/deleted filenames.
- [x] Update links in `README.md`, `AGENTS.md`, and current docs.

### 7. Validation

- [x] Re-read current-state docs for obvious stale statements.
- [x] Check commands in docs against `package.json`.
- [x] Check API endpoint names against `server.js`.
- [x] Check collector names and schedules against `backend/src/config.js`.
- [x] Check frontend route/layout notes against `frontend/src/App.jsx`.
- [x] Check map overlay notes against `frontend/src/components/InteractiveMap.jsx`.
- [x] Check parser notes against `backend/src/parsers/`.
- [x] Run markdown link/path search for missing references.
- [x] Inspect `git diff --stat`.
- [x] Inspect moved archive content for accidental content loss.
- [x] Leave `tmp/` and unrelated scratch files unstaged unless explicitly requested.

### 8. Final Commit Criteria

- [x] Current docs have a clear entry point through `docs/README.md`.
- [x] Stale docs are archived, deleted, or clearly marked.
- [x] No current document presents unimplemented plans as current behavior.
- [x] No generated runtime data is staged.
- [x] No unrelated scratch directory is staged.
- [x] Final summary lists moved, merged, updated, archived, and deleted documents.

## Cleanup Phases

### Phase 1: Inventory

Create a table of every file under `docs/`.

Recommended columns:

- `file`
- `topic`
- `current/stale/partial/unknown`
- `doc type`: architecture, feature design, parser algorithm, ops note, historical plan, scratch
- `related code`
- `recommended action`: keep, merge, update, archive, delete
- `notes`

Do not change document contents during this phase except for this plan if needed.

### Phase 2: Target Structure

Decide the final documentation structure before moving files.

Preferred target structure:

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

This structure can be adjusted if the inventory shows a better split.

### Phase 3: Code Verification

For each retained or merged topic, verify against the relevant implementation.

Suggested code anchors:

- App shell and routing: `frontend/src/App.jsx`, `frontend/src/utils/route-mode.js`
- Mobile `/ops`: `frontend/src/App.jsx`, `frontend/src/components/MetarCard.jsx`, `frontend/src/components/TafTimeline.jsx`, `frontend/src/App.css`
- Map overlays: `frontend/src/components/InteractiveMap.jsx`
- API server: `server.js`
- Polling/API client: `frontend/src/utils/api.js`
- Scheduler: `backend/src/index.js`, `backend/src/config.js`
- Store/cache: `backend/src/store.js`
- Collectors: `backend/src/processors/`
- Parsers: `backend/src/parsers/`
- Alert settings: `frontend/src/utils/alerts.js`, `frontend/src/components/alerts/`

### Phase 4: Merge And Rewrite

For each target document:

- Start with current behavior.
- Add important implementation constraints.
- Link to detailed historical documents only when useful.
- Remove abandoned ideas unless marked clearly as historical.
- Keep examples aligned with current command names in `package.json`.

### Phase 5: Archive Or Delete

Archive when:

- The document explains design history that is still useful.
- The implementation changed but the old reasoning may help future work.
- The document is too detailed for current docs but not wrong enough to delete.

Delete when:

- The document is scratch material with no durable value.
- The content is fully duplicated by updated docs.
- The filename/content is misleading and no longer useful.

Record archive/delete decisions in the inventory before applying them.

### Phase 6: Final Validation

Before finalizing:

- Ensure `docs/README.md` links every current document.
- Ensure stale documents are either archived with status notes or removed.
- Check that `README.md` and `AGENTS.md` do not point to deleted paths.
- Run a repository search for old filenames if files were renamed.
- Run `git status --short` and inspect the final diff.

## Initial Classification Hints

Likely merge candidates:

- Radar, lightning, satellite, SIGWX, SIGMET/AIRMET, ADS-B map behavior can likely feed `map-overlays.md`.
- METAR, TAF, and warning parsing documents can likely feed `weather-parsing.md`.
- Alert system, advisory filters, minima, and traffic settings can likely feed `alerts-and-settings.md`.
- Dark mode, mobile `/ops`, ground forecast, and airport forecast view can likely feed `frontend-dashboard.md`.

Likely keep-as-dedicated candidates if still current:

- `SIGWX_LOW_Design.md`
- `SIGMET_AIRMET_Design.md`
- `TAF_Hourly_Resolution_Algorithm.md`
- `METAR_Parsing_Algorithm.md`

Likely review-for-delete/archive candidates:

- Temporary or vague documents such as `new project.md`.
- Early implementation plans that are fully superseded by current behavior.

## Open Questions

- Should historical documents stay in Git under `docs/archive/`, or should some be deleted outright?
- Should final docs be English-only, Korean-only, or mixed to match the existing codebase notes?
- Should current-state docs include diagrams, or stay text-first for easier maintenance?

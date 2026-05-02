# Snapshot Meta Polling Plan

## Goal

- Reduce repeated polling traffic for `metar`, `taf`, `warning`, `lightning`, and radar echo metadata.
- Keep the current polling model, but fetch full payloads only when content actually changed.

## Current Problem

- The frontend currently polls all major APIs every 30 seconds.
- Most polling cycles fetch unchanged payloads.
- `fetched_at` cannot be used as a reliable change detector because `latest.json` may update `fetched_at` even when content is unchanged.

## Key Decision

- Use `content_hash` for:
  - `metar`
  - `taf`
  - `warning`
  - `lightning`
- Use `tm` for:
  - radar echo (`echo_meta.json`)

## Important Constraint

- `fetched_at` is not a content version.
- `content_hash` must be derived from canonicalized payload content.
- The hash calculation must ignore:
  - `fetched_at`
  - `type`
  - `_stale`
  - `content_hash` itself

## Backend Changes

### 1. Persist `content_hash` in `latest.json`

Target file:

- `backend/src/store.js`

Work:

- Reuse the existing canonical hash logic.
- Add `content_hash` to saved `latest.json` payloads.
- Ensure `content_hash` is excluded from the canonical hash input.
- When content is unchanged:
  - keep updating `fetched_at` if desired
  - keep `content_hash` stable

### 2. Add snapshot metadata endpoint

Target file:

- `server.js`

Add endpoint:

- `/api/snapshot-meta`

Expected response shape:

```json
{
  "metar": { "hash": "..." },
  "taf": { "hash": "..." },
  "warning": { "hash": "..." },
  "lightning": { "hash": "..." },
  "echo": { "tm": "202603111525" }
}
```

Notes:

- `metar`, `taf`, `warning`, `lightning` should read `content_hash` from `latest.json`.
- `echo` should read `tm` from `backend/data/radar/echo_meta.json`.

## Frontend Changes

### 3. Split initial load from incremental polling

Target files:

- `frontend/src/utils/api.js`
- `frontend/src/App.jsx`

Current behavior:

- `loadAllData()` fetches everything on every polling cycle.

Planned behavior:

- Initial load:
  - `/api/metar`
  - `/api/taf`
  - `/api/warning`
  - `/api/lightning`
  - `/data/radar/echo_meta.json`
  - `/api/airports`
  - `/api/warning-types`
  - `/api/alert-defaults`
- Polling load:
  - `/api/snapshot-meta` only
- If snapshot values changed:
  - fetch only changed datasets

### 4. Keep one-time data out of polling

These should load once on page entry:

- `airports`
- `warning-types`
- `alert-defaults`

## Suggested Frontend Flow

1. On first load, fetch all required datasets.
2. Store current comparison values in memory:
   - `metar.content_hash`
   - `taf.content_hash`
   - `warning.content_hash`
   - `lightning.content_hash`
   - `echoMeta.tm`
3. Every polling interval:
   - call `/api/snapshot-meta`
   - compare response values with local values
4. Re-fetch only changed datasets.
5. Update local comparison values after successful refresh.

## Known Risks

### 1. `fetched_at` false positives

- Already understood.
- Must not be used as the main change key.

### 2. Partial refresh state consistency

- After moving away from `loadAllData()`, care is needed so `setData()` merges changed sections correctly.
- Avoid accidentally dropping unchanged sections from React state.

### 3. Alert evaluation side effects

- `App.jsx` alert logic depends on `data`.
- Partial data refresh must still preserve correct previous/current comparisons.

### 4. Radar echo metadata shape

- The map currently depends on `echo_meta.json`.
- Snapshot comparison should only use `tm`, but the full `echo_meta.json` still needs to be reloaded when `tm` changes.

## Recommended Implementation Order

1. Update `backend/src/store.js` to persist `content_hash`
2. Add `/api/snapshot-meta` in `server.js`
3. Refactor `frontend/src/utils/api.js`
4. Refactor polling logic in `frontend/src/App.jsx`
5. Verify alert behavior and map echo updates

## Verification Checklist

Backend:

- `node backend/test/run-once.js metar`
- `node backend/test/run-once.js taf`
- `node backend/test/run-once.js warning`
- `node backend/test/run-once.js lightning`
- `node backend/test/run-once.js radar-echo`

Frontend:

- `npm --prefix frontend run build`

Manual:

- Initial page load still works
- Polling no longer refetches unchanged datasets
- TAF refreshes only when content changes
- Lightning refreshes only when content changes
- Radar loop updates when `echo_meta.tm` changes

## Summary

- The approach is feasible.
- No new dependency is required.
- The main technical requirement is introducing a stable `content_hash` and using it instead of `fetched_at`.

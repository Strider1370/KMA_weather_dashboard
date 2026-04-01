Place test-page data files under this folder.

`/test` will read these files first and fall back to the normal live APIs when a file is missing.

Supported paths:

- `test/metar/latest.json`
- `test/taf/latest.json`
- `test/amos/latest.json`
- `test/warning/latest.json`
- `test/lightning/latest.json`
- `test/adsb/latest.json`
- `test/sigmet/latest.json`
- `test/airmet/latest.json`
- `test/sigwx-low/latest.json`
- `test/sigwx-low/history.json`
- `test/radar/echo_meta.json`
- `test/satellite/sat_meta.json`

Recommended usage:

1. Copy `backend/data/<type>/latest.json` into the matching `frontend/public/test/...` path.
2. Commit those files to the branch or repository you want `/test` to show.
3. Open `/test` and select a real airport. `TST1` is no longer used there.

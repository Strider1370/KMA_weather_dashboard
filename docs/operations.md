# Operations

Status: Current as of 2026-05-02.

이 문서는 실행, 빌드, 배포, 보안, 운영 검증에 필요한 현재 기준을 모읍니다.

## 사이트에서 하는 일

운영 관점에서 이 프로젝트는 외부 기상 API를 주기적으로 호출하는 수집 프로세스와, 사용자가 접속하는 대시보드 서버로 나뉜다. 운영자는 API 키, 실행 명령, 빌드 절차, 배포 방식, rate limit, 정적 파일 제공, nginx/reverse proxy 구성을 올바르게 맞춰야 사이트가 안정적으로 동작한다.

이 문서는 기능 설계보다는 “서버를 어떻게 띄우고, 배포하고, 장애 시 어디를 확인할지”를 설명한다. 데이터가 안 보이거나 오래된 경우 어떤 collector와 `backend/data/*/latest.json`을 확인해야 하는지도 이 문서의 범위다.

## Runtime Requirements

- Node.js 18+; Node.js 20 recommended.
- npm 9+.
- `.env` with a valid `API_AUTH_KEY` for KMA APIs.
- Optional external API keys for AirKorea/KMA UV when environment data is needed.

## Install

```bash
npm install
npm --prefix frontend install
```

## Run

Scheduler only:

```bash
npm run start
```

Dashboard server:

```bash
npm run dashboard
```

Local development:

```bash
npm run dev
```

`npm run dev` starts `server.js` and the Vite dev server through `concurrently`.

## Build

```bash
npm --prefix frontend run build
npm --prefix frontend run preview
```

Boundary build tools:

```bash
npm run geo:sido
npm run geo:sigungu
npm run geo:topo
npm run geo:neighbors
```

## Test / Smoke Verification

Full collector smoke test:

```bash
npm test
```

Single collector targets:

```bash
node backend/test/run-once.js metar
node backend/test/run-once.js taf
node backend/test/run-once.js warning
node backend/test/run-once.js sigmet
node backend/test/run-once.js airmet
node backend/test/run-once.js sigwx-low
node backend/test/run-once.js amos
node backend/test/run-once.js lightning
node backend/test/run-once.js radar-echo
node backend/test/run-once.js adsb
node backend/test/run-once.js satellite
node backend/test/run-once.js ground-forecast
```

`environment` is scheduled by the app but is not currently exposed as a `run-once.js` target.

For local TLS chain issues only:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm test
```

Do not use TLS rejection bypass as an operational fix.

## Environment Variables

Common variables:

```env
API_AUTH_KEY=your_kma_key
PORT=5173
DATA_PATH=backend/data
API_BASE_URL=https://apihub.kma.go.kr/api/typ02/openApi
LIGHTNING_API_URL=https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php
SIGWX_LOW_API_URL=https://apihub.kma.go.kr/api/typ01/url/amo_sigwx.php
AMOS_API_URL=https://apihub.kma.go.kr/api/typ01/url/amos.php
RADAR_API_URL=https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php
RADAR_CMP_TYPE=hsr
SATELLITE_API_URL=https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B
SATELLITE_FOG_API_URL=https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2
ADSB_API_URL=https://opensky-network.org/api/states/all
```

Additional environment data variables:

```env
AIRKOREA_API_KEY=your_airkorea_key
KMA_UV_API_KEY=your_kma_uv_key
```

If `KMA_UV_API_KEY` is missing, current config falls back to `API_AUTH_KEY`.

## Server Behavior

`server.js`:

- Binds to `127.0.0.1`.
- Redirects `/` to `/ops`.
- Serves SPA entries for `/ops`, `/ground`, and `/test`.
- Serves API responses under `/api/*`.
- Serves generated data under `/data/*`.
- Serves frontend build assets from `frontend/dist` when present.

Security-related headers currently include:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Content Security Policy allowing self resources and inline styles.
- CORS `Access-Control-Allow-Origin: *` for `/api/*` and `/data/*`.

API rate limiting:

- In-memory, per client IP.
- Limit: 300 API requests per 60 seconds.
- Exceeding the limit returns HTTP 429.

## Static Caching

`server.js` applies cache headers:

- Versioned `.geojson` / `.topojson`: `public, max-age=31536000, immutable`
- Airport weather image assets: `public, max-age=86400`
- Other frontend/static responses: `no-cache`

If nginx serves `frontend/dist` directly, keep MIME and compression handling for `.geojson`, `.topojson`, `.json`, `.js`, and `.css`.

Recommended MIME additions:

```nginx
types {
  application/geo+json geojson;
  application/topo+json topojson;
}
```

## Deployment Notes

Typical update flow:

```bash
git pull --rebase origin main
npm install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart weather-app || pm2 start server.js --name weather-app
pm2 save
pm2 logs weather-app --lines 100
```

If local server changes block pull:

```bash
git stash push -u -m "server-local-before-update"
```

Do not commit generated runtime data under `backend/data/` unless explicitly requested.

## Security Posture

Current public-dashboard assumptions:

- The dashboard is a public read-only service.
- No login/auth is currently required.
- The main security goal is abuse and traffic pressure reduction, not data secrecy.
- Direct Node port exposure should be avoided; place it behind nginx or an equivalent reverse proxy.

Current applied controls:

- Node binds to `127.0.0.1`.
- Basic security headers are set in `server.js`.
- API/data CORS is open by design for public data.
- Basic in-memory API rate limiting exists.

Recommended next controls:

- Endpoint-specific nginx rate limits.
- Temporary ban automation for repeated abusive clients.
- Request/429 monitoring.
- HTTPS and HSTS once a domain/certificate are available.
- CORS allowlist if the service becomes domain-specific rather than public.

## Troubleshooting

KMA 401/403:

- Check `API_AUTH_KEY`.
- Check API quota and endpoint availability.

Dashboard data appears stale:

- Check `backend/data/<type>/latest.json` modification time.
- Check scheduler logs.
- Check `/api/snapshot-meta`.
- Confirm collector process is running.
- Check `backend/data/stats/latest.json` when the scheduler process is active.

Radar/satellite frames missing:

- Check `backend/data/radar/echo_meta.json`.
- Check `backend/data/satellite/sat_meta.json`.
- Run targeted `run-once.js` collectors.

OpenSky/HTTPS local failures:

- For local tests only, try temporary `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- For production, fix the server CA chain.

Port conflict:

- Change `PORT`.
- Or stop the existing process.

## PowerShell UTF-8 Reads

Korean Markdown can render incorrectly with plain `Get-Content` in some PowerShell sessions.

Use:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -Raw -Encoding UTF8 "docs/operations.md"
```

## Superseded Source Notes

The following existing docs should be merged into this document and then archived or marked superseded:

- `security-hardening-plan.md`
- operational parts of `rate-limit-and-radar-loop-notes.md`
- runtime stats notes from `Stats_Design.md`
- deployment and nginx notes currently duplicated in root `README.md`

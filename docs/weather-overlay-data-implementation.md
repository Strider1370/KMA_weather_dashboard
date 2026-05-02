# Weather Overlay Data Implementation

Status: Current implementation spec as of 2026-05-02.

이 문서는 레이더, 위성, 낙뢰, ADS-B 지도 오버레이 데이터를 다른 프로젝트에서 재구현할 수 있도록 현재 백엔드 처리 로직을 설명합니다.

## 사이트에서 하는 일

이 기능은 지도에서 사용자가 켜고 끄는 강수에코, 위성/안개, 낙뢰, TRAFFIC 레이어의 데이터를 만든다. 레이더와 위성은 원본 binary/NetCDF 자료를 브라우저가 바로 표시할 수 있는 이미지 프레임으로 변환하고, 낙뢰는 전국 strike history와 공항별 거리권 집계를 만들며, ADS-B는 항공기 위치를 FIR 기준으로 필터링해 지도 마커로 표시할 수 있게 한다.

사용자는 하단 타임라인으로 레이더/위성 프레임을 재생하고, 낙뢰의 시간대별 분포와 선택 공항 주변 8/16/32km 위험권을 확인하며, TRAFFIC 레이어로 항공기 callsign/고도/속도/방향을 확인한다. 이 문서는 그 화면 기능을 가능하게 하는 백엔드 데이터 생성 규칙을 설명한다.

## Scope

Covered files:

- `backend/src/processors/radar-echo-processor.js`
- `backend/src/parsers/radar-echo-parser.js`
- `backend/src/processors/satellite-processor.js`
- `backend/src/parsers/satellite-parser.js`
- `backend/src/processors/lightning-processor.js`
- `backend/src/parsers/lightning-parser.js`
- `backend/src/processors/adsb-processor.js`

Frontend layer/timeline rendering is summarized in `map-overlays.md`; this document focuses on backend data production.

## Radar Echo

### Source And Output

Source API:

- `config.api.radar_url`
- query:
  - `tm`
  - `data=bin`
  - `cmp=config.radar_echo.cmp`
  - `authKey=config.api.auth_key`

Main outputs:

- `backend/data/radar/echo_korea_<tm>.png`
- `backend/data/radar/echo_meta.json`

Render version:

```js
"rainrate-reproject-full-v2"
```

### Timestamp Selection

Radar timestamps are KST `YYYYMMDDHHmm`.

Candidate selection:

1. Start from current UTC time.
2. Convert to KST by adding 9 hours.
3. Subtract `config.radar_echo.delay_minutes`.
4. Floor minutes to the previous 5-minute boundary.
5. Build three candidates: latest, latest - 5 min, latest - 10 min.

Frame timeline:

- Latest successful candidate becomes `latestTm`.
- `buildFrameTms(latestTm, frameCount)` creates `frameCount` timestamps at 5-minute intervals, oldest first.
- Default frame count is `config.radar_echo.max_images || 36`.

### Fetch Validation

Radar binary fetch uses `AbortController` timeout.

A response is accepted only when:

- HTTP status is OK.
- Buffer length is at least `10000`.
- First bytes are gzip magic `0x1f 0x8b`.

Invalid or failed fetch returns `null`.

### Binary Parsing

Radar binary format:

- gzip-compressed payload
- 1024-byte header
- grid: `NX=2305`, `NY=2881`
- data cell: signed 16-bit integer
- stored value is dBZ multiplied by 100
- no-data threshold: `-25000`

Header parsing:

1. Try little-endian `readInt16LE` at offsets 20 and 22.
2. If grid dimensions do not match, retry big-endian.
3. If neither matches `2305x2881`, throw.

Reflectivity array:

```js
refl[i] = read16(raw, 1024 + i * 2)
```

### Projection

Radar uses Lambert Conformal Conic.

Constants:

| Constant | Value |
|---|---:|
| earth radius | `6371.00877 km` |
| `PHI1` | `30°` |
| `PHI2` | `60°` |
| `PHI0` | `38°` |
| `LAM0` | `126°` |
| `GRID_X0` | `1120` |
| `GRID_Y0` | `1680` |
| `DXY` | `0.5 km` |

`latLonToGrid(lat, lon)` and `gridToLatLon(x, y)` use the same LCC constants.

Radar bounds are derived by sampling the outer grid edges and converting samples to lat/lon. Bounds are cached.

### Full Coverage Rendering

The current product renders nationwide/full-domain PNGs.

Steps:

1. Derive radar geographic bounds.
2. Convert north/south latitudes to Web Mercator Y.
3. Output width is `BASE_OUTPUT_WIDTH / scale`, default `1600`.
4. Output height preserves Web Mercator aspect ratio.
5. For each output pixel:
   - compute Web Mercator Y and convert to latitude
   - linearly interpolate longitude
   - convert lat/lon to radar grid
   - nearest-neighbor sample `refl[gy * NX + gx]`
   - skip out-of-grid and `NO_DATA`
   - convert dBZ to rain rate
   - convert rain rate to RGBA
6. Write PNG with `sharp`.

dBZ to rain rate:

```js
Z = 10 ** (dBZ / 10)
rainRate = (Z / 200) ** (1 / 1.6)
```

Rain-rate color thresholds are in `rainRateToRGBA()`. Values below `0.1 mm/h` are transparent.

### Metadata

`echo_meta.json`:

```js
{
  type: "RADAR_ECHO",
  cmp,
  render_version,
  updated_at,
  tm,
  nationwide,
  frames
}
```

Each frame:

```js
{
  tm,
  cmp,
  render_version,
  path,
  bounds,
  width,
  height,
  echoCount,
  scale
}
```

Only frame files referenced in metadata are kept. Old `echo_korea.png` and unreferenced `echo_korea_<tm>.png` files are removed.

### Incremental Rendering

Existing frames are reused only when:

- metadata `cmp` matches current `config.radar_echo.cmp`
- metadata `render_version` matches current render version
- PNG file exists

Missing frames are split:

- immediate: newest `4` missing frames
- deferred: older missing frames rendered by background fill

Background fill updates metadata after each rendered frame.

## Satellite / Fog Composite

### Source And Output

Source APIs:

- LE1B IR: `config.satellite.url/{channel}/{region}/data?date=<UTC tm>&authKey=...`
- LE2 FOG: `config.satellite.fog_url/{product}/{region}/data?date=<UTC tm>&authKey=...`

Defaults from config/AGENTS:

- channel: `IR105`
- product: `FOG`
- region: `KO`

Main outputs:

- `backend/data/satellite/sat_korea_<displayTm>.webp`
- `backend/data/satellite/sat_meta.json`

Render version:

```js
"fog-composite-v3-kst-tm-webp"
```

### Timestamp Selection

Satellite request timestamps are UTC `YYYYMMDDHHmm`; display timestamps are KST-aligned `YYYYMMDDHHmm`.

Candidate selection:

1. Start from current UTC time.
2. Subtract `config.satellite.delay_minutes`.
3. Floor minutes to previous 10-minute boundary.
4. Build three candidates: latest, latest - 10 min, latest - 20 min.
5. For each candidate, store:
   - `requestTm`: UTC tm used for API request.
   - `displayTm`: KST tm used in filename and UI metadata.

Frame list:

- `buildFrameSpecs(latestRequestTm, frameCount)` builds `frameCount` 10-minute frames, oldest first.
- Default frame count is `config.satellite.max_frames || 18`.

### NetCDF Validation

NC fetch uses timeout and accepts only HDF5/NetCDF4 buffers:

- length at least `1000`
- magic bytes `0x89 0x48 0x44 0x46`

IR is required. FOG is optional.

### Projection And NC Parsing

The parser uses `h5wasm`.

IR parser:

- dataset: `image_pixel_values`
- projection attrs from root or fallback defaults

FOG parser:

- dataset `FOG`
- dataset `Del_Fta`
- projection attrs from `gk2a_imager_projection` when present

Projection defaults for KO:

```js
{
  width: 900,
  height: 900,
  pixelSize: 2000,
  ulEasting: -899000,
  ulNorthing: 899000
}
```

LCC constants:

| Constant | Value |
|---|---:|
| earth radius | `6371009 m` |
| `PHI1` | `30°` |
| `PHI2` | `60°` |
| `PHI0` | `38°` |
| `LAM0` | `126°` |

Output bounds:

- west `114.0`
- east `138.0`
- south `29.3`
- north `45.8`

### Fog Composite Rendering

Output width is `1200`; height preserves Web Mercator aspect ratio for the fixed output bounds.

For each output pixel:

1. Convert pixel row to Web Mercator Y and latitude.
2. Interpolate longitude.
3. Convert lat/lon to LCC easting/northing.
4. Convert easting/northing to source row/column:
   - `col = round((e - ulEasting) / pixelSize)`
   - `row = round((ulNorthing - n) / pixelSize)`
5. Skip out-of-source pixels.
6. If `FOG === 5` and `Del_Fta !== -32768`, render fog color with alpha `220`.
7. Otherwise render IR grayscale with alpha `200`.

IR display range:

- If source values look like Kelvin (`min >= 150 && max <= 350`), use fixed range `190K..310K`.
- Otherwise use 2nd to 98th percentile.
- Gamma: `1.15`.

Fog color:

- `legendValue = clamp((Del_Fta + 10) / 10, 0, 6)`
- interpolate through KMA-like stops:
  - red
  - orange
  - yellow
  - green

### Metadata And Retry

`sat_meta.json`:

```js
{
  type: "SATELLITE",
  product: "FOG",
  channel,
  region,
  render_version,
  updated_at,
  tm,
  request_tm_utc,
  latest,
  frames
}
```

Each frame:

```js
{
  tm,
  request_tm_utc,
  product: "FOG",
  channel,
  render_version,
  path,
  bounds,
  width,
  height,
  fogPixelCount
}
```

When FOG NC is missing:

- render IR-only frame
- set `fogPixelCount: null`
- schedule retry for the latest frame
- retry delay: 3 minutes
- max retries: 2

Existing frames are reused only when render version matches, file exists, and `fogPixelCount !== null`. Missing/IR-only frames are re-rendered.

Old unreferenced `sat_korea_<tm>.png` and `.webp` files are removed.

## Lightning

### Source And Output

Source API:

- `config.api.lightning_url`
- query:
  - `tm`
  - `itv=config.lightning.itv_minutes`
  - `lon=config.lightning.nationwide.lon`
  - `lat=config.lightning.nationwide.lat`
  - `range=config.lightning.nationwide.range_km`
  - `gc=T`
  - `authKey=config.api.auth_key`

Main output:

- `backend/data/lightning/latest.json`

History window:

- `240` minutes

### Payload Parsing

Raw payload must contain both markers:

- `#START7777`
- `#7777END`

Each non-comment line is split by whitespace:

```text
tm lon lat intensity type height
```

Rules:

- `tm` is KST `YYYYMMDDHHmmss`.
- Convert to UTC ISO and KST ISO.
- Skip rows with invalid time, lon, lat, intensity.
- Keep only type `G` or `C`.
- `G` means ground lightning; `C` means cloud lightning.
- `height` is stored only for cloud lightning when numeric.
- `polarity` is `positive` when intensity >= 0, otherwise `negative`.
- `intensity_abs = abs(intensity)`.

### Airport Zone Classification

Distance uses haversine with earth radius `6371 km`.

Zone rules:

- `distance <= zones.alert` -> `alert`
- else `distance <= zones.danger` -> `danger`
- else `distance <= zones.caution` -> `caution`
- otherwise `outside`

Distance is rounded to one decimal km.

### Incremental Collection

Main `process()`:

1. Align current KST time to `config.lightning.itv_minutes`.
2. Shift back one interval.
3. Build 12 lookback windows: `12 * 5min = 60min` by default.
4. Load previous `latest.json`.
5. Keep previous strikes within 240 minutes.
6. Fetch each nationwide window with retry:
   - timeout 30s
   - max retries 3
   - retry delay 3s
7. Merge by strike key:

```js
`${time}|${lon}|${lat}|${type}|${intensity}`
```

8. Drop strikes older than 240 minutes.
9. Sort newest first.
10. Build nationwide and per-airport payloads.
11. Save with `store.save("lightning", result)`.

If every fetch fails and previous data exists, return previous data without saving.

### Backfill Collection

`processBackfill()` is used by the test runner.

- Builds the full 240-minute window.
- Fetches every 5-minute slot.
- Throws only when all windows fail and no strikes are collected.
- Saves result with query metadata:
  - `backfill: true`
  - `backfill_from_tm`
  - `backfill_to_tm`

### Output Shape

```js
{
  type: "lightning",
  fetched_at,
  query,
  history_window_minutes: 240,
  airports: {
    [icao]: {
      airport_name,
      arp,
      summary,
      strikes
    }
  },
  nationwide: {
    summary,
    strikes
  }
}
```

Summary:

```js
{
  total_count,
  by_zone: { alert, danger, caution },
  by_type: { ground, cloud },
  max_intensity,
  latest_time
}
```

## ADS-B

### Source And Output

Source API:

- OpenSky `states/all`
- URL: `config.adsb.url`
- query:
  - `lamin`
  - `lomin`
  - `lamax`
  - `lomax`

Main output:

- `backend/data/adsb/latest.json`

### Fetch Behavior

Fetch uses:

- `AbortController` timeout from `config.adsb.timeout_ms`
- User-Agent `KMA-Weather-Dashboard/1.0`

If normal fetch fails because of `SELF_SIGNED_CERT_IN_CHAIN`, it retries with `https.request()` and `rejectUnauthorized: false`. This fallback is environment-specific and should not be the first choice in new deployments.

### FIR Filtering

The processor loads:

- `frontend/public/geo/rkrr_fir.geojson`

Only the first feature polygon outer ring is used.

Filtering:

- If FIR file is unavailable, every bbox aircraft is accepted.
- Otherwise ray-casting point-in-polygon checks `(lon, lat)` against the outer ring.

### OpenSky State Mapping

OpenSky array fields:

| Index | Output |
|---:|---|
| 0 | `icao24` |
| 1 | `callsign` trimmed |
| 2 | `origin_country` |
| 3 | `time_position` |
| 4 | `last_contact` |
| 5 | `lon` |
| 6 | `lat` |
| 7 | `baro_altitude` |
| 8 | `on_ground` |
| 9 | `velocity` |
| 10 | `true_track` |
| 11 | `vertical_rate` |
| 13 | `geo_altitude` |
| 14 | `squawk` |
| 15 | `spi` |
| 16 | `position_source` |

Rows without numeric latitude or longitude are dropped.

Aircraft are sorted by:

```js
`${callsign || ""}-${icao24 || ""}`
```

### Output Shape

```js
{
  type: "adsb",
  source: "opensky-network",
  fetched_at,
  updated_at,
  bounds,
  total_aircraft,
  aircraft,
  content_hash
}
```

`updated_at` uses OpenSky response `time` when present; otherwise current time.

`content_hash` is SHA-256 over canonicalized payload excluding `updated_at`, `fetched_at`, and `content_hash`.

## Frontend Contract

The frontend expects:

- radar `echo_meta.json.frames[*].path` and `bounds`
- satellite `sat_meta.json.frames[*].path`, `bounds`, and `request_tm_utc`
- lightning `nationwide.strikes` plus airport summaries
- ADS-B `aircraft` with `lat`, `lon`, altitude, callsign, heading, speed

The map timeline uses radar frames first when radar is enabled, satellite frames only when radar is disabled, and lightning uses the active frame timestamp as its reference time.

## Verification

```bash
node backend/test/run-once.js radar-echo
node backend/test/run-once.js satellite
node backend/test/run-once.js lightning
node backend/test/run-once.js adsb
```

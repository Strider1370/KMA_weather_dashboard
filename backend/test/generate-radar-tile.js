/**
 * generate-radar-tile.js
 *
 * KMA 레이더 합성 이진자료(.bin.gz)에서 공항별 480×480 PNG 타일을 생성한다.
 * (상하반전 교정, 24단계 공식 mm/h 색상, 쌍선형 보간 적용)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

const airports = require('../../shared/airports');

const OUT_DIR = path.join(__dirname, '../../backend/data/radar-tiles');
const TILE_SIZE = 480;
const TILE_RANGE = 45; // km (중앙에서 끝까지)

// ── KMA LCC 투영 상수 (HB 영역) ──────────────────────────────────
const PHI1 = 30.0 * Math.PI / 180;
const PHI2 = 60.0 * Math.PI / 180;
const PHI0 = 38.0 * Math.PI / 180;
const LAM0 = 126.0 * Math.PI / 180;
const R_KM = 6371.0;
const COL0 = 1120;
const ROW0 = 1200; // 38N (Top-down 기준 교정값)
const DXY_KM = 0.5;

const LCC_N = Math.log(Math.cos(PHI1) / Math.cos(PHI2)) / Math.log(Math.tan(Math.PI / 4 + PHI2 / 2) / Math.tan(Math.PI / 4 + PHI1 / 2));
const LCC_F = Math.cos(PHI1) * Math.pow(Math.tan(Math.PI / 4 + PHI1 / 2), LCC_N) / LCC_N;
const LCC_R0 = R_KM * LCC_F / Math.pow(Math.tan(Math.PI / 4 + PHI0 / 2), LCC_N);

function lccForward(lat_deg, lon_deg) {
  const phi = lat_deg * Math.PI / 180;
  const lam = lon_deg * Math.PI / 180;
  const rho = R_KM * LCC_F / Math.pow(Math.tan(Math.PI / 4 + phi / 2), LCC_N);
  const th  = LCC_N * (lam - LAM0);
  const x_km = rho * Math.sin(th);
  const y_km = LCC_R0 - rho * Math.cos(th);
  return { col: COL0 + x_km / DXY_KM, row: ROW0 - y_km / DXY_KM };
}

/** 24단계 강수 색상 매핑 (RDR_CMB 범례와 100% 일치) */
function mmhToRGBA(mmh) {
  if (mmh === null || mmh < 0.05) return [0, 0, 0, 0]; // 무강수 투명

  if (mmh < 0.1)   return [176, 236, 255, 120];
  if (mmh < 0.5)   return [120, 200, 255, 160];
  if (mmh < 1.0)   return [60,  160, 255, 200];
  if (mmh < 2.0)   return [0,   255, 0,   255];
  if (mmh < 3.0)   return [0,   200, 0,   255];
  if (mmh < 4.0)   return [0,   144, 0,   255];
  if (mmh < 5.0)   return [184, 255, 0,   255];
  if (mmh < 6.0)   return [255, 255, 0,   255];
  if (mmh < 7.0)   return [255, 216, 0,   255];
  if (mmh < 8.0)   return [255, 180, 0,   255];
  if (mmh < 9.0)   return [255, 144, 0,   255];
  if (mmh < 10.0)  return [255, 108, 0,   255];
  if (mmh < 15.0)  return [255, 0,   0,   255];
  if (mmh < 20.0)  return [212, 0,   0,   255];
  if (mmh < 25.0)  return [172, 0,   0,   255];
  if (mmh < 30.0)  return [128, 0,   0,   255];
  if (mmh < 40.0)  return [255, 148, 255, 255];
  if (mmh < 50.0)  return [255, 0,   255, 255];
  if (mmh < 60.0)  return [192, 0,   192, 255];
  if (mmh < 70.0)  return [128, 0,   128, 255];
  if (mmh < 90.0)  return [184, 184, 255, 255];
  if (mmh < 110.0) return [84,  84,  255, 255];
  if (mmh < 150.0) return [20,  20,  152, 255];
  return [10, 10, 80, 255];
}

function dbzToMmh(dbz) {
  if (dbz === null || dbz < -10) return 0;
  return Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);
}

function sampleBilinear(grid, col, row, nx, ny) {
  const c0 = Math.floor(col), c1 = Math.min(c0 + 1, nx - 1);
  const r0 = Math.floor(row), r1 = Math.min(r0 + 1, ny - 1);
  if (c0 < 0 || c1 >= nx || r0 < 0 || r1 >= ny) return null;

  const invR0 = ny - 1 - r0;
  const invR1 = ny - 1 - r1;
  const fc = col - c0, fr = row - r0;

  const v00 = grid[invR0 * nx + c0];
  const v10 = grid[invR0 * nx + c1];
  const v01 = grid[invR1 * nx + c0];
  const v11 = grid[invR1 * nx + c1];

  if (v00 < -20000 || v10 < -20000 || v01 < -20000 || v11 < -20000) return null;
  return (v00*(1-fc)*(1-fr) + v10*fc*(1-fr) + v01*(1-fc)*fr + v11*fc*fr) / 100;
}

function generateTile(grid, nx, ny, arp) {
  const png = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  const center = TILE_SIZE / 2;
  const scale = center / TILE_RANGE;
  const cosLat = Math.cos(arp.lat * Math.PI / 180);

  for (let py = 0; py < TILE_SIZE; py++) {
    for (let px = 0; px < TILE_SIZE; px++) {
      const x_km = (px - center) / scale;
      const y_km = (center - py) / scale;
      const lat = arp.lat + y_km / 111.32;
      const lon = arp.lon + x_km / (111.32 * cosLat);

      const { col, row } = lccForward(lat, lon);
      const dbz = sampleBilinear(grid, col, row, nx, ny);
      const [r, g, b, a] = mmhToRGBA(dbzToMmh(dbz));

      const idx = (py * TILE_SIZE + px) * 4;
      png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = a;
    }
  }
  return PNG.sync.write(png);
}

function main() {
  const args = process.argv.slice(2);
  const binGzPath = path.resolve(args[0]);
  const targets = airports.filter(a => args.slice(1).includes(a.icao) || (args.length === 1 && !a.mock_only) || (args.length === 1 && a.icao === 'TST1'));

  const buf = zlib.gunzipSync(fs.readFileSync(binGzPath));
  const nx = buf.readInt16LE(20), ny = buf.readInt16LE(22);
  const grid = new Int16Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) grid[i] = buf.readInt16LE(1024 + i * 2);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const arp of targets) {
    const pngBuf = generateTile(grid, nx, ny, arp);
    fs.writeFileSync(path.join(OUT_DIR, `${arp.icao}_latest.png`), pngBuf);
    console.log(`✓ Generated ${arp.icao}`);
  }
}

main();

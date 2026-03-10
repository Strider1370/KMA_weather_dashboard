#!/usr/bin/env node
'use strict';

/**
 * Test: Parse KMA radar binary (RDR_CMP_*_PUB) and render
 * radar echoes overlaid on GeoJSON admin boundaries.
 *
 * Usage: node scripts/test-radar-overlay.js [input.bin.gz] [output.png] [scale]
 *   scale: downscale factor (default 2 → 1153×1441 output)
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const sharp = require('sharp');

/* ── Constants ────────────────────────────────────────────── */
const HEADER_SIZE = 1024;
const DEG2RAD = Math.PI / 180;
const RE_KM = 6371.00877; // KMA standard Earth radius

/* ── LCC Projection (KMA Standard) ───────────────────────── */
const PHI1 = 30.0 * DEG2RAD;   // standard parallel 1
const PHI2 = 60.0 * DEG2RAD;   // standard parallel 2
const PHI0 = 38.0 * DEG2RAD;   // reference latitude
const LAM0 = 126.0 * DEG2RAD;  // reference longitude
const GRID_X0 = 1120;          // 0-indexed ref grid X (spec: 1121, 1-indexed)
const GRID_Y0 = 1680;          // 0-indexed ref grid Y (spec: 1681, 1-indexed)
const DXY = 0.5;               // grid spacing (km)

// precompute LCC constants
const _n = Math.log(Math.cos(PHI1) / Math.cos(PHI2)) /
           Math.log(Math.tan(Math.PI / 4 + PHI2 / 2) / Math.tan(Math.PI / 4 + PHI1 / 2));
const _F = Math.cos(PHI1) * Math.pow(Math.tan(Math.PI / 4 + PHI1 / 2), _n) / _n;
const _rho0 = RE_KM * _F / Math.pow(Math.tan(Math.PI / 4 + PHI0 / 2), _n);

/** lat/lon (degrees) → 0-indexed grid (x, y) */
function latLonToGrid(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const rho = RE_KM * _F / Math.pow(Math.tan(Math.PI / 4 + lat / 2), _n);
  const theta = _n * (lon - LAM0);
  return {
    x: GRID_X0 + rho * Math.sin(theta) / DXY,
    y: GRID_Y0 + (_rho0 - rho * Math.cos(theta)) / DXY,
  };
}

/* ── Radar Color Scale (dBZ → RGBA) ──────────────────────── */
function dBZtoRGBA(dBZ) {
  if (dBZ < 5)  return null;          // transparent (no echo)
  if (dBZ < 10) return [0, 236, 236, 160];    // cyan
  if (dBZ < 15) return [1, 160, 246, 170];    // light blue
  if (dBZ < 20) return [0, 0, 246, 180];      // blue
  if (dBZ < 25) return [0, 255, 0, 190];      // bright green
  if (dBZ < 30) return [0, 200, 0, 200];      // green
  if (dBZ < 35) return [255, 255, 0, 210];    // yellow
  if (dBZ < 40) return [255, 200, 0, 220];    // amber
  if (dBZ < 45) return [255, 140, 0, 230];    // orange
  if (dBZ < 50) return [255, 0, 0, 240];      // red
  if (dBZ < 55) return [200, 0, 0, 245];      // dark red
  if (dBZ < 60) return [180, 0, 200, 250];    // magenta
  return [255, 0, 255, 255];                   // purple
}

/* ── Bresenham line drawing ──────────────────────────────── */
function drawLine(buf, w, h, x0, y0, x1, y1, r, g, b, a) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  if (dx + dy === 0) return;
  if (dx > w * 2 || dy > h * 2) return; // skip degenerate
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const limit = dx + dy + 1;
  for (let i = 0; i < limit; i++) {
    if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
      const idx = (y0 * w + x0) * 4;
      buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = a;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/* ── Parse RDR_CMP_HEAD (64 bytes, packed) ───────────────── */
function parseHeader(buf, read16) {
  const pad = (v) => String(v).padStart(2, '0');
  const version = buf.readUInt8(0);
  const ptype = read16(buf, 1);
  // TIME_SS at offset 3
  const yy = read16(buf, 3);
  const mm = buf.readUInt8(5);
  const dd = buf.readUInt8(6);
  const hh = buf.readUInt8(7);
  const mi = buf.readUInt8(8);
  const ss = buf.readUInt8(9);
  return {
    version,
    ptype,
    time: `${yy}-${pad(mm)}-${pad(dd)} ${pad(hh)}:${pad(mi)}:${pad(ss)}`,
    num_stn: buf.readUInt8(17),
    map_code: buf.readUInt8(18),
    nx: read16(buf, 20),
    ny: read16(buf, 22),
    nz: read16(buf, 24),
    dxy_m: read16(buf, 26),
    num_data: buf.readUInt8(32),
  };
}

/* ── Main ────────────────────────────────────────────────── */
async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] || path.resolve(__dirname, '..', 'RDR_CMP_CPP_PUB_202603090300.bin.gz');
  const outputFile = args[1] || path.resolve(__dirname, '..', 'radar_overlay_test.png');
  const SCALE = parseInt(args[2] || '2', 10);
  const geojsonPath = path.resolve(__dirname, '..', 'map.geojson');

  console.log(`Input  : ${path.basename(inputFile)}`);
  console.log(`Output : ${path.basename(outputFile)}`);
  console.log(`Scale  : 1/${SCALE}\n`);

  /* 1 ─ Decompress */
  console.time('decompress');
  const raw = zlib.gunzipSync(fs.readFileSync(inputFile));
  console.timeEnd('decompress');
  console.log(`Raw: ${(raw.length / 1048576).toFixed(1)} MB`);

  /* 2 ─ Parse header (auto-detect endianness) */
  const readLE = (b, o) => b.readInt16LE(o);
  const readBE = (b, o) => b.readInt16BE(o);

  let header = parseHeader(raw, readLE);
  let read16 = readLE;
  let endian = 'LE';

  if (header.nx !== 2305 || header.ny !== 2881) {
    header = parseHeader(raw, readBE);
    read16 = readBE;
    endian = 'BE';
  }

  if (header.nx !== 2305 || header.ny !== 2881) {
    console.error(`ERROR: unexpected grid ${header.nx}x${header.ny} (expected 2305x2881)`);
    console.error('Header bytes (hex 0-31):');
    console.error(raw.subarray(0, 32).toString('hex'));
    process.exit(1);
  }

  console.log(`Endian : ${endian}`);
  console.log(`Header : ${JSON.stringify(header)}\n`);

  const NX = header.nx;
  const NY = header.ny;
  const outW = Math.ceil(NX / SCALE);
  const outH = Math.ceil(NY / SCALE);

  /* 3 ─ Read reflectivity block (first data block after header) */
  console.time('read-data');
  const dataOffset = HEADER_SIZE;
  const pixelCount = NX * NY;
  const refl = new Int16Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    refl[i] = read16(raw, dataOffset + i * 2);
  }
  console.timeEnd('read-data');

  // Stats
  let minV = Infinity, maxV = -Infinity, validCnt = 0;
  for (let i = 0; i < pixelCount; i++) {
    const v = refl[i];
    if (v > -20000) {
      validCnt++;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  console.log(`Valid  : ${validCnt} / ${pixelCount} (${(validCnt / pixelCount * 100).toFixed(1)}%)`);
  if (validCnt > 0) console.log(`dBZ    : ${(minV / 100).toFixed(1)} ~ ${(maxV / 100).toFixed(1)}`);
  console.log('');

  /* 4 ─ Render radar image */
  console.time('render-total');
  console.time('render-radar');
  const buf = Buffer.alloc(outW * outH * 4);

  // fill dark background
  for (let i = 0; i < outW * outH; i++) {
    const o = i * 4;
    buf[o] = 0x13; buf[o + 1] = 0x1a; buf[o + 2] = 0x24; buf[o + 3] = 255;
  }

  // radar echoes — data y=0 is south, image row=0 is north → flip
  let echoCnt = 0;
  for (let dy = 0; dy < NY; dy++) {
    const row = Math.floor((NY - 1 - dy) / SCALE);
    if (row < 0 || row >= outH) continue;
    for (let dx = 0; dx < NX; dx++) {
      const col = Math.floor(dx / SCALE);
      if (col < 0 || col >= outW) continue;
      const v = refl[dy * NX + dx];
      if (v <= -25000) continue; // null
      const c = dBZtoRGBA(v / 100);
      if (!c) continue;
      echoCnt++;
      const o = (row * outW + col) * 4;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = c[3];
    }
  }
  console.timeEnd('render-radar');
  console.log(`Echoes : ${echoCnt} pixels`);

  /* 5 ─ GeoJSON boundary overlay */
  if (fs.existsSync(geojsonPath)) {
    console.time('render-geojson');
    const geo = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    console.log(`GeoJSON: ${geo.features.length} features`);

    const lineR = 0x00, lineG = 0xcc, lineB = 0x66, lineA = 0xa0;

    for (const feat of geo.features) {
      const geom = feat.geometry;
      let rings = [];
      if (geom.type === 'Polygon') rings = geom.coordinates;
      else if (geom.type === 'MultiPolygon') rings = geom.coordinates.flat(1);

      for (const ring of rings) {
        for (let k = 0; k < ring.length - 1; k++) {
          const a = latLonToGrid(ring[k][1], ring[k][0]);
          const b = latLonToGrid(ring[k + 1][1], ring[k + 1][0]);
          drawLine(
            buf, outW, outH,
            a.x / SCALE, (NY - 1 - a.y) / SCALE,
            b.x / SCALE, (NY - 1 - b.y) / SCALE,
            lineR, lineG, lineB, lineA
          );
        }
      }
    }
    console.timeEnd('render-geojson');
  } else {
    console.warn('map.geojson not found — skipping boundary overlay.');
  }
  console.timeEnd('render-total');

  /* 6 ─ Save PNG */
  console.time('save-png');
  await sharp(buf, { raw: { width: outW, height: outH, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toFile(outputFile);
  console.timeEnd('save-png');

  const sz = fs.statSync(outputFile).size;
  console.log(`\nDone → ${path.basename(outputFile)} (${outW}×${outH}, ${(sz / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

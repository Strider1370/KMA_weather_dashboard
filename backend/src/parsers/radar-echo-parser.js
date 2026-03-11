"use strict";

const zlib = require("zlib");
const sharp = require("sharp");

/* ── Constants ────────────────────────────────────────────── */
const HEADER_SIZE = 1024;
const DEG2RAD = Math.PI / 180;
const RE_KM = 6371.00877; // KMA standard Earth radius
const NX = 2305;
const NY = 2881;

/* ── LCC Projection (KMA Standard) ───────────────────────── */
const PHI1 = 30.0 * DEG2RAD;
const PHI2 = 60.0 * DEG2RAD;
const PHI0 = 38.0 * DEG2RAD;
const LAM0 = 126.0 * DEG2RAD;
const GRID_X0 = 1120; // 0-indexed (spec: 1121, 1-indexed)
const GRID_Y0 = 1680; // 0-indexed (spec: 1681, 1-indexed)
const DXY = 0.5;      // grid spacing (km)

// Precompute LCC constants
const _n = Math.log(Math.cos(PHI1) / Math.cos(PHI2)) /
           Math.log(Math.tan(Math.PI / 4 + PHI2 / 2) / Math.tan(Math.PI / 4 + PHI1 / 2));
const _F = Math.cos(PHI1) * Math.pow(Math.tan(Math.PI / 4 + PHI1 / 2), _n) / _n;
const _rho0 = RE_KM * _F / Math.pow(Math.tan(Math.PI / 4 + PHI0 / 2), _n);

/**
 * lat/lon (degrees) → 0-indexed grid (x, y)
 */
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

function gridToLatLon(x, y) {
  const xKm = (x - GRID_X0) * DXY;
  const yKm = (y - GRID_Y0) * DXY;
  const rhoX = xKm;
  const rhoY = _rho0 - yKm;
  const rho = Math.sqrt(rhoX * rhoX + rhoY * rhoY);
  const theta = Math.atan2(rhoX, rhoY);

  const lat = 2 * Math.atan(Math.pow((RE_KM * _F) / rho, 1 / _n)) - Math.PI / 2;
  const lon = LAM0 + theta / _n;

  return {
    lat: lat / DEG2RAD,
    lon: lon / DEG2RAD,
  };
}

/* ── Radar Color Scale (dBZ → RGBA) ──────────────────────── */
function dBZtoRGBA(dBZ) {
  if (dBZ < 5)  return null;
  if (dBZ < 10) return [0, 236, 236, 160];
  if (dBZ < 15) return [1, 160, 246, 170];
  if (dBZ < 20) return [0, 0, 246, 180];
  if (dBZ < 25) return [0, 255, 0, 190];
  if (dBZ < 30) return [0, 200, 0, 200];
  if (dBZ < 35) return [255, 255, 0, 210];
  if (dBZ < 40) return [255, 200, 0, 220];
  if (dBZ < 45) return [255, 140, 0, 230];
  if (dBZ < 50) return [255, 0, 0, 240];
  if (dBZ < 55) return [200, 0, 0, 245];
  if (dBZ < 60) return [180, 0, 200, 250];
  return [255, 0, 255, 255];
}

/**
 * Parse RDR_CMP_HEAD (first 64 bytes)
 */
function parseHeader(buf, read16) {
  return {
    nx: read16(buf, 20),
    ny: read16(buf, 22),
  };
}

/**
 * Decompress .bin.gz → raw Buffer, auto-detect endianness,
 * return reflectivity Int16Array + read16 function.
 */
function parseRadarBinary(gzBuffer) {
  const raw = zlib.gunzipSync(gzBuffer);

  // Auto-detect endianness
  const readLE = (b, o) => b.readInt16LE(o);
  const readBE = (b, o) => b.readInt16BE(o);

  let header = parseHeader(raw, readLE);
  let read16 = readLE;

  if (header.nx !== NX || header.ny !== NY) {
    header = parseHeader(raw, readBE);
    read16 = readBE;
  }

  if (header.nx !== NX || header.ny !== NY) {
    throw new Error(`Unexpected grid ${header.nx}x${header.ny} (expected ${NX}x${NY})`);
  }

  // Read reflectivity block (Int16 × NX × NY after 1024-byte header)
  const pixelCount = NX * NY;
  const refl = new Int16Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    refl[i] = read16(raw, HEADER_SIZE + i * 2);
  }

  return { refl, nx: NX, ny: NY };
}

/**
 * Crop radar echo for a single airport and render to transparent PNG buffer.
 *
 * @param {Int16Array} refl - Full reflectivity grid (NX×NY)
 * @param {number} lat - Airport latitude
 * @param {number} lon - Airport longitude
 * @param {number} rangeKm - Crop radius in km (default 100)
 * @param {number} cropSize - Output image size in pixels (default 200)
 * @returns {Promise<{pngBuffer: Buffer, bounds: number[][], echoCount: number}>}
 */
async function cropAirportEcho(refl, lat, lon, rangeKm = 100, cropSize = 200) {
  const center = latLonToGrid(lat, lon);
  const halfGrids = rangeKm / DXY; // 100km / 0.5km = 200 grid cells

  const gxMin = Math.floor(center.x - halfGrids);
  const gyMin = Math.floor(center.y - halfGrids);
  const gxMax = Math.ceil(center.x + halfGrids);
  const gyMax = Math.ceil(center.y + halfGrids);
  const srcW = gxMax - gxMin;
  const srcH = gyMax - gyMin;

  // Render to RGBA buffer (transparent background)
  const buf = Buffer.alloc(cropSize * cropSize * 4); // all zeros = transparent
  let echoCount = 0;

  for (let gy = gyMin; gy < gyMax; gy++) {
    // Data y=0 is south, so flip for image (row=0 is north)
    const imgRow = Math.floor((gyMax - 1 - gy) / (srcH / cropSize));
    if (imgRow < 0 || imgRow >= cropSize) continue;

    for (let gx = gxMin; gx < gxMax; gx++) {
      const imgCol = Math.floor((gx - gxMin) / (srcW / cropSize));
      if (imgCol < 0 || imgCol >= cropSize) continue;

      // Bounds check for full grid
      if (gx < 0 || gx >= NX || gy < 0 || gy >= NY) continue;

      const v = refl[gy * NX + gx];
      if (v <= -25000) continue; // null/out-of-range
      const dBZ = v / 100;
      const c = dBZtoRGBA(dBZ);
      if (!c) continue;

      echoCount++;
      const o = (imgRow * cropSize + imgCol) * 4;
      // Alpha-composite: take the strongest echo if multiple grid cells map to same pixel
      if (buf[o + 3] === 0 || c[3] > buf[o + 3]) {
        buf[o] = c[0];
        buf[o + 1] = c[1];
        buf[o + 2] = c[2];
        buf[o + 3] = c[3];
      }
    }
  }

  // Compute lat/lon bounds for ImageOverlay
  const latRange = rangeKm / 111.32;
  const lonRange = rangeKm / (111.32 * Math.cos(lat * DEG2RAD));
  const bounds = [
    [lat - latRange, lon - lonRange], // [south, west]
    [lat + latRange, lon + lonRange], // [north, east]
  ];

  // Convert raw RGBA to PNG using sharp
  const pngBuffer = await sharp(buf, {
    raw: { width: cropSize, height: cropSize, channels: 4 },
  })
    .png({ compressionLevel: 3 })
    .toBuffer();

  return { pngBuffer, bounds, echoCount, width: cropSize, height: cropSize };
}

async function renderNationwideEcho(refl, scale = 1) {
  const outW = Math.ceil(NX / scale);
  const outH = Math.ceil(NY / scale);
  const buf = Buffer.alloc(outW * outH * 4);
  let echoCount = 0;

  for (let gy = 0; gy < NY; gy++) {
    const imgRow = Math.floor((NY - 1 - gy) / scale);
    if (imgRow < 0 || imgRow >= outH) continue;

    for (let gx = 0; gx < NX; gx++) {
      const imgCol = Math.floor(gx / scale);
      if (imgCol < 0 || imgCol >= outW) continue;

      const v = refl[gy * NX + gx];
      if (v <= -25000) continue;

      const dBZ = v / 100;
      const c = dBZtoRGBA(dBZ);
      if (!c) continue;

      echoCount++;
      const o = (imgRow * outW + imgCol) * 4;
      if (buf[o + 3] === 0 || c[3] > buf[o + 3]) {
        buf[o] = c[0];
        buf[o + 1] = c[1];
        buf[o + 2] = c[2];
        buf[o + 3] = c[3];
      }
    }
  }

  // Use raster outer edges, not pixel centers, for ImageOverlay bounds.
  const corners = [
    gridToLatLon(-0.5, -0.5),
    gridToLatLon(NX - 0.5, -0.5),
    gridToLatLon(-0.5, NY - 0.5),
    gridToLatLon(NX - 0.5, NY - 0.5),
  ];
  const lats = corners.map((corner) => corner.lat);
  const lons = corners.map((corner) => corner.lon);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];

  const pngBuffer = await sharp(buf, {
    raw: { width: outW, height: outH, channels: 4 },
  })
    .png({ compressionLevel: 3 })
    .toBuffer();

  return { pngBuffer, bounds, echoCount, width: outW, height: outH, scale };
}

module.exports = {
  parseRadarBinary,
  cropAirportEcho,
  renderNationwideEcho,
  latLonToGrid,
  gridToLatLon,
  dBZtoRGBA,
};

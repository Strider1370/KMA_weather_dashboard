/**
 * generate-full-radar.js
 *
 * KMA 레이더 합성 이진자료(.bin.gz)에서 전체 그리드(2305x2881) 이미지를 생성한다.
 * RDR_CMB 공식 영상의 24단계 색상 범례를 정밀하게 구현.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

/** 
 * mm/h → RGBA (RDR_CMB 공식 영상 우측 범례 색상 추출)
 */
function mmhToRGBA(mmh) {
  if (mmh === null || mmh < 0.05) return [255, 255, 255, 255]; // 0.0 (배경)

  if (mmh < 0.1)   return [176, 236, 255, 255]; // 0.1 미만
  if (mmh < 0.5)   return [120, 200, 255, 255]; // 0.1 ~ 0.5
  if (mmh < 1.0)   return [60,  160, 255, 255]; // 0.5 ~ 1.0
  if (mmh < 2.0)   return [0,   255, 0,   255]; // 1.0 ~ 2.0
  if (mmh < 3.0)   return [0,   200, 0,   255]; // 2.0 ~ 3.0
  if (mmh < 4.0)   return [0,   144, 0,   255]; // 3.0 ~ 4.0
  if (mmh < 5.0)   return [184, 255, 0,   255]; // 4.0 ~ 5.0
  if (mmh < 6.0)   return [255, 255, 0,   255]; // 5.0 ~ 6.0
  if (mmh < 7.0)   return [255, 216, 0,   255]; // 6.0 ~ 7.0
  if (mmh < 8.0)   return [255, 180, 0,   255]; // 7.0 ~ 8.0
  if (mmh < 9.0)   return [255, 144, 0,   255]; // 8.0 ~ 9.0
  if (mmh < 10.0)  return [255, 108, 0,   255]; // 9.0 ~ 10.0
  if (mmh < 15.0)  return [255, 0,   0,   255]; // 10.0 ~ 15.0
  if (mmh < 20.0)  return [212, 0,   0,   255]; // 15.0 ~ 20.0
  if (mmh < 25.0)  return [172, 0,   0,   255]; // 20.0 ~ 25.0
  if (mmh < 30.0)  return [128, 0,   0,   255]; // 25.0 ~ 30.0
  if (mmh < 40.0)  return [255, 148, 255, 255]; // 30.0 ~ 40.0
  if (mmh < 50.0)  return [255, 0,   255, 255]; // 40.0 ~ 50.0
  if (mmh < 60.0)  return [192, 0,   192, 255]; // 50.0 ~ 60.0
  if (mmh < 70.0)  return [128, 0,   128, 255]; // 60.0 ~ 70.0
  if (mmh < 90.0)  return [184, 184, 255, 255]; // 70.0 ~ 90.0
  if (mmh < 110.0) return [84,  84,  255, 255]; // 90.0 ~ 110.0
  if (mmh < 150.0) return [20,  20,  152, 255]; // 110.0 ~ 150.0
  return                  [10,  10,  80,  255]; // 150.0 이상
}

/** dBZ를 mm/h 강수량으로 변환 (Z = 200 * R^1.6) */
function dbzToMmh(dbz) {
  if (dbz === null || dbz < -10) return 0;
  return Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);
}

function parseHeader(buf) {
  const nx       = buf.readInt16LE(20);
  const ny       = buf.readInt16LE(22);
  const tm = {
    year:   buf.readInt16LE(3),
    month:  buf.readUInt8(5),
    day:    buf.readUInt8(6),
    hour:   buf.readUInt8(7),
    minute: buf.readUInt8(8),
  };
  return { nx, ny, tm };
}

function readReflectivityBlock(buf, nx, ny) {
  const HEADER_SIZE = 1024;
  const count = nx * ny;
  const grid = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    grid[i] = buf.readInt16LE(HEADER_SIZE + i * 2);
  }
  return grid;
}

/** 쌍선형 보간 샘플링 */
function sampleGridBilinear(grid, nx, ny, c, r) {
  const c0 = Math.floor(c), c1 = Math.min(c0 + 1, nx - 1);
  const r0 = Math.floor(r), r1 = Math.min(r0 + 1, ny - 1);
  const fc = c - c0, fr = r - r0;

  const v00 = grid[r0 * nx + c0];
  const v10 = grid[r0 * nx + c1];
  const v01 = grid[r1 * nx + c0];
  const v11 = grid[r1 * nx + c1];

  if (v00 < -20000 || v10 < -20000 || v01 < -20000 || v11 < -20000) {
    const raw = grid[Math.round(r) * nx + Math.round(c)];
    return raw < -20000 ? null : raw / 100;
  }

  const res = (v00 / 100) * (1 - fc) * (1 - fr) +
              (v10 / 100) * fc * (1 - fr) +
              (v01 / 100) * (1 - fc) * fr +
              (v11 / 100) * fc * fr;
  return res;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.exit(1);
  }

  const binGzPath = path.resolve(args[0]);
  const compressed = fs.readFileSync(binGzPath);
  const buf = zlib.gunzipSync(compressed);

  const hdr = parseHeader(buf);
  const { nx, ny, tm } = hdr;
  const grid = readReflectivityBlock(buf, nx, ny);

  const png = new PNG({ width: nx, height: ny });

  for (let r = 0; r < ny; r++) {
    const gridRow = ny - 1 - r;
    for (let c = 0; c < nx; c++) {
      const dbz = sampleGridBilinear(grid, nx, ny, c, gridRow);
      const mmh = dbz !== null ? dbzToMmh(dbz) : null;
      const [red, g, b, a] = mmhToRGBA(mmh);

      const idx = (r * nx + c) * 4;
      png.data[idx]     = red;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  const tmStr = `${tm.year}${String(tm.month).padStart(2,'0')}${String(tm.day).padStart(2,'0')}${String(tm.hour).padStart(2,'0')}${String(tm.minute).padStart(2,'0')}`;
  const outPath = `RDR_CPP_full_${tmStr}_final.png`;
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log(`✓ 완료: ${outPath}`);
}

main();

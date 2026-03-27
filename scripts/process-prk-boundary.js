/**
 * process-prk-boundary.js
 *
 * GADM 북한 행정경계 데이터(레벨1 도 단위)를 가공해
 * korea_prk_boundary.v1.geojson 을 생성합니다.
 *
 * 사전 준비:
 *   scripts/gadm36_PRK_1.json 파일이 있어야 합니다.
 *
 * 실행:
 *   node scripts/process-prk-boundary.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const INPUT  = path.join(__dirname, "gadm36_PRK_1.json");
const OUTPUT = path.join(__dirname, "../frontend/public/geo/korea_prk_boundary.v1.geojson");

const PRECISION = 4;

if (!fs.existsSync(INPUT)) {
  console.error("입력 파일을 찾을 수 없습니다:", INPUT);
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(INPUT, "utf8"));

function truncate(n) {
  return Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;
}

function truncateRing(ring) {
  return ring.map(([lon, lat]) => [truncate(lon), truncate(lat)]);
}

function truncateCoords(type, coords) {
  if (type === "Polygon") return coords.map(truncateRing);
  if (type === "MultiPolygon") return coords.map((poly) => poly.map(truncateRing));
  return coords;
}

const features = (source.features || [])
  .filter((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon")
  .map((f) => ({
    type: "Feature",
    properties: {
      name: f.properties?.NAME_1 || f.properties?.NAME_0 || "",
      iso: f.properties?.GID_0 || "PRK",
    },
    geometry: {
      type: f.geometry.type,
      coordinates: truncateCoords(f.geometry.type, f.geometry.coordinates),
    },
  }));

const output = { type: "FeatureCollection", features };
fs.writeFileSync(OUTPUT, JSON.stringify(output) + "\n", "utf8");

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`완료: ${OUTPUT}`);
console.log(` - 도 수: ${features.length}`);
console.log(` - 파일 크기: ${sizeMB} MB`);

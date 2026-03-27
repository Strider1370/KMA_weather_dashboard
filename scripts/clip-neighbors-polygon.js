/**
 * clip-neighbors-polygon.js
 *
 * Natural Earth 1:10m 국가 폴리곤 데이터를 한반도 주변 bbox로 클리핑해
 * korea_neighbors_masked.v1.geojson 을 새로 생성합니다.
 *
 * 사전 준비:
 *   1. https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/
 *      에서 GeoJSON 버전 다운로드
 *   2. 다운받은 파일을 scripts/ 폴더에 ne_10m_admin_0_countries.geojson 이름으로 저장
 *
 * 실행:
 *   node scripts/clip-neighbors-polygon.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ── 설정 ──────────────────────────────────────────────
const INPUT  = path.join(__dirname, "ne_10m_admin_0_countries.json");
const OUTPUT = path.join(__dirname, "../frontend/public/geo/korea_neighbors_masked.v1.geojson");

// 전국 모드 축소 시 보이는 영역 (넉넉하게)
const BBOX = {
  minLon: 105,
  maxLon: 150,
  minLat: 20,
  maxLat: 55,
};

// 제외할 국가 ISO 코드 (한국은 korea_boundaries.v1.topojson에서 이미 처리)
const EXCLUDE_ISO = new Set(["KOR"]);

// 좌표 소수점 자리수 제한 (파일 크기 절감)
const PRECISION = 4;
// ─────────────────────────────────────────────────────

if (!fs.existsSync(INPUT)) {
  console.error("입력 파일을 찾을 수 없습니다:", INPUT);
  console.error("ne_10m_admin_0_countries.geojson 파일을 scripts/ 폴더에 넣어주세요.");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(INPUT, "utf8"));

function truncate(n) {
  return Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;
}

function clipRing(ring) {
  return ring.map(([lon, lat]) => [truncate(lon), truncate(lat)]);
}

function clipCoords(type, coords) {
  if (type === "Polygon") return coords.map(clipRing);
  if (type === "MultiPolygon") return coords.map((poly) => poly.map(clipRing));
  return coords;
}

function bboxOverlaps(geometry) {
  const coords = [];
  function collect(arr, depth) {
    if (depth === 0) { coords.push(arr); return; }
    arr.forEach((c) => collect(c, depth - 1));
  }
  const depth = geometry.type === "Polygon" ? 2 : 3;
  collect(geometry.coordinates, depth);
  return coords.some(([lon, lat]) =>
    lon >= BBOX.minLon && lon <= BBOX.maxLon &&
    lat >= BBOX.minLat && lat <= BBOX.maxLat
  );
}

const features = (source.features || []).filter((f) => {
  const iso = f.properties?.ISO_A3 || f.properties?.ADM0_ISO || "";
  if (EXCLUDE_ISO.has(iso)) return false;
  const type = f.geometry?.type;
  if (type !== "Polygon" && type !== "MultiPolygon") return false;
  return bboxOverlaps(f.geometry);
}).map((f) => ({
  type: "Feature",
  properties: {
    name: f.properties?.NAME || f.properties?.ADMIN || "",
    iso:  f.properties?.ISO_A3 || "",
  },
  geometry: {
    type: f.geometry.type,
    coordinates: clipCoords(f.geometry.type, f.geometry.coordinates),
  },
}));

const output = { type: "FeatureCollection", features };
fs.writeFileSync(OUTPUT, JSON.stringify(output) + "\n", "utf8");

const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`완료: ${OUTPUT}`);
console.log(` - 국가 수: ${features.length}`);
console.log(` - 파일 크기: ${sizeMB} MB`);

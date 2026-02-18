// 1회 실행 빌드 도구: map.geojson → frontend/public/geo/{ICAO}_admdong.geojson + {ICAO}_sigungu.geojson
// 실행: node backend/test/sliceGeoJSON.js  (project/ 디렉토리에서)
const fs = require('fs');
const path = require('path');
const { union } = require('@turf/union');

const airports = require('../../shared/airports.js');
const REAL_AIRPORTS = airports.filter(a => !a.mock_only);

const RANGE_KM = 32;
const PADDING = 1.5; // 정사각형 패널 모서리(~45km) 커버를 위해 48km bbox 사용

function getBbox(lat, lon, km) {
  const dLat = (km * PADDING) / 111.32;
  const dLon = (km * PADDING) / (111.32 * Math.cos(lat * Math.PI / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

function flatCoords(geometry) {
  const t = geometry.type;
  if (t === 'Polygon')      return geometry.coordinates.flat(1);
  if (t === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
}

function sliceByBbox(geojson, bbox) {
  return geojson.features.filter(f =>
    flatCoords(f.geometry).some(([lon, lat]) =>
      lon >= bbox.minLon && lon <= bbox.maxLon &&
      lat >= bbox.minLat && lat <= bbox.maxLat
    )
  );
}

// 같은 sgg 코드를 가진 feature들을 union으로 병합 (@turf/union v7: FeatureCollection 입력)
function dissolveByKey(features, keyFn) {
  const groups = new Map();
  for (const f of features) {
    const key = keyFn(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const dissolved = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      dissolved.push(group[0]);
      continue;
    }
    const fc = { type: 'FeatureCollection', features: group };
    const result = union(fc);
    if (result) dissolved.push(result);
  }
  return dissolved;
}

const mapPath = path.join(__dirname, '../../map.geojson');
if (!fs.existsSync(mapPath)) {
  console.error('map.geojson not found at:', mapPath);
  process.exit(1);
}

const outDir = path.join(__dirname, '../../frontend/public/geo');
fs.mkdirSync(outDir, { recursive: true });

console.log('Loading map.geojson...');
const admDong = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

for (const airport of REAL_AIRPORTS) {
  const bbox = getBbox(airport.lat, airport.lon, RANGE_KM);
  const sliced = sliceByBbox(admDong, bbox);

  // 행정동 파일 (기존)
  fs.writeFileSync(
    path.join(outDir, `${airport.icao}_admdong.geojson`),
    JSON.stringify({ type: 'FeatureCollection', features: sliced })
  );

  // 시군구 dissolve
  process.stdout.write(`${airport.icao}: ${sliced.length} 행정동 → dissolving...`);
  const sggFeatures = dissolveByKey(sliced, f => f.properties.sgg);
  fs.writeFileSync(
    path.join(outDir, `${airport.icao}_sigungu.geojson`),
    JSON.stringify({ type: 'FeatureCollection', features: sggFeatures })
  );
  console.log(` ${sggFeatures.length} 시군구`);
}
console.log('Done! → frontend/public/geo/');

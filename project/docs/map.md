# KMA Aviation Weather Dashboard
## 낙뢰 맵 해안선·행정동 경계 표시 — 구현 설계 문서

---

## 개요

현재 LightningMap 컴포넌트에 해안선과 행정동 경계를 SVG 레이어로 덧씌우는 작업이다.  
기존 `toCanvasXY` 좌표 변환 함수를 그대로 재사용하며, 공항 ARP 기준 반경 32km 이내의 지도만 표시한다.

---

## 대상 공항

| ICAO | 공항명 | lat | lon |
|------|--------|-----|-----|
| RKSI | 인천국제공항 | 37.4602 | 126.4407 |
| RKSS | 김포국제공항 | 37.5583 | 126.7906 |
| RKPC | 제주국제공항 | 33.5113 | 126.4926 |
| RKPU | 울산공항 | 35.5935 | 129.3520 |
| RKJB | 무안국제공항 | 34.9914 | 126.3828 |
| RKJY | 여수공항 | 34.8423 | 127.6167 |
| RKNY | 양양국제공항 | 38.0613 | 128.6692 |
| RKPK | 김해국제공항 | 35.1795 | 128.9380 |

---

## 최종 파일 구조

```
project/
├── public/
│   └── geo/
│       ├── RKSI_admdong.geojson
│       ├── RKSI_coastline.geojson
│       ├── RKSS_admdong.geojson
│       ├── RKSS_coastline.geojson
│       └── ... (공항별 16개 파일)
├── scripts/
│   └── sliceGeoJSON.js        ← 빌드 전 1회 실행
├── src/
│   ├── components/
│   │   └── LightningMap.jsx
│   └── utils/
│       └── geoToSVG.js
├── map.geojson                ← 원본 행정동 (33MB)
└── coastline.geojson          ← mapshaper로 추출한 해안선 (3MB)
```

---

## 1단계: GeoJSON 파일 준비 (완료)

`map.geojson`(33MB)과 `coastline.geojson`(3MB)이 이미 준비된 상태.

| 파일 | 역할 | 비고 |
|------|------|------|
| `map.geojson` | 행정동 경계 레이어 | 원본 그대로 사용 |
| `coastline.geojson` | 해안선 레이어 | map.geojson에서 `-dissolve -lines`로 추출 |

> simplify 생략. 공항별 32km bbox로 잘라서 쓰기 때문에 원본 해상도가 더 좋다.

---

## 2단계: 공항별 GeoJSON 슬라이스 스크립트

전국 GeoJSON을 통째로 브라우저에서 불러오면 너무 크다.  
빌드 전 1회 실행하는 Node.js 스크립트로 공항별 32km bbox 파일을 미리 잘라 `public/geo/`에 저장한다.

### scripts/sliceGeoJSON.js

```js
const fs = require('fs');
const path = require('path');

const AIRPORTS = {
  RKSI: { lat: 37.4602, lon: 126.4407 },
  RKSS: { lat: 37.5583, lon: 126.7906 },
  RKPC: { lat: 33.5113, lon: 126.4926 },
  RKPU: { lat: 35.5935, lon: 129.3520 },
  RKJB: { lat: 34.9914, lon: 126.3828 },
  RKJY: { lat: 34.8423, lon: 127.6167 },
  RKNY: { lat: 38.0613, lon: 128.6692 },
  RKPK: { lat: 35.1795, lon: 128.9380 },
};

const RANGE_KM = 32;
const PADDING = 1.2; // 여유 20%

function getBbox(lat, lon, km) {
  const dLat = (km * PADDING) / 111.32;
  const dLon = (km * PADDING) / (111.32 * Math.cos(lat * Math.PI / 180));
  return { minLat: lat-dLat, maxLat: lat+dLat, minLon: lon-dLon, maxLon: lon+dLon };
}

function flatCoords(geometry) {
  const t = geometry.type;
  if (t === 'LineString')      return geometry.coordinates;
  if (t === 'MultiLineString') return geometry.coordinates.flat(1);
  if (t === 'Polygon')         return geometry.coordinates.flat(1);
  if (t === 'MultiPolygon')    return geometry.coordinates.flat(2);
  return [];
}

function sliceGeoJSON(geojson, bbox) {
  return {
    type: 'FeatureCollection',
    features: geojson.features.filter(f =>
      flatCoords(f.geometry).some(([lon, lat]) =>
        lon >= bbox.minLon && lon <= bbox.maxLon &&
        lat >= bbox.minLat && lat <= bbox.maxLat
      )
    )
  };
}

// 실행
const outDir = path.join(__dirname, '../public/geo');
fs.mkdirSync(outDir, { recursive: true });

console.log('Loading GeoJSON files...');
const admDong  = JSON.parse(fs.readFileSync('map.geojson', 'utf8'));
const coastline = JSON.parse(fs.readFileSync('coastline.geojson', 'utf8'));

for (const [icao, arp] of Object.entries(AIRPORTS)) {
  const bbox = getBbox(arp.lat, arp.lon, RANGE_KM);

  const dongSlice  = sliceGeoJSON(admDong, bbox);
  const coastSlice = sliceGeoJSON(coastline, bbox);

  fs.writeFileSync(path.join(outDir, `${icao}_admdong.geojson`),   JSON.stringify(dongSlice));
  fs.writeFileSync(path.join(outDir, `${icao}_coastline.geojson`), JSON.stringify(coastSlice));

  console.log(`${icao}: dong=${dongSlice.features.length} coast=${coastSlice.features.length}`);
}
console.log('Done! → public/geo/');
```

### 실행

`map.geojson`과 `coastline.geojson`이 프로젝트 루트에 있는 상태에서:

```bash
node scripts/sliceGeoJSON.js
```

> 빌드 전 한 번만 실행. 공항 ARP가 바뀌지 않는 한 재실행 불필요.

---

## 3단계: GeoJSON → SVG Path 변환 유틸

기존 `toCanvasXY` 함수를 재사용해 GeoJSON 좌표를 SVG 픽셀로 변환한다.

### src/utils/geoToSVG.js

```js
import { toCanvasXY } from './helpers'; // 기존 함수 재사용

export function geoToSVGPaths(geojson, arp, size, rangeKm) {
  const results = [];

  geojson.features.forEach((feature, fi) => {
    const geom = feature.geometry;
    let rings = [];

    if (geom.type === 'LineString')       rings = [geom.coordinates];
    else if (geom.type === 'MultiLineString') rings = geom.coordinates;
    else if (geom.type === 'Polygon')     rings = geom.coordinates;
    else if (geom.type === 'MultiPolygon')  rings = geom.coordinates.flat(1);

    rings.forEach((ring, ri) => {
      const d = ring.map((coord, i) => {
        const { x, y } = toCanvasXY(
          { lon: coord[0], lat: coord[1] },
          arp, size, rangeKm
        );
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

      results.push({ key: `${fi}-${ri}`, d });
    });
  });

  return results;
}
```

---

## 4단계: LightningMap.jsx 수정

### 추가할 state / useEffect

```jsx
const [admDong,   setAdmDong]   = useState(null);
const [coastline, setCoastline] = useState(null);

useEffect(() => {
  if (!selectedAirport) return;
  setAdmDong(null);
  setCoastline(null);
  Promise.all([
    fetch(`/geo/${selectedAirport}_admdong.geojson`).then(r => r.json()),
    fetch(`/geo/${selectedAirport}_coastline.geojson`).then(r => r.json()),
  ]).then(([dong, coast]) => {
    setAdmDong(dong);
    setCoastline(coast);
  });
}, [selectedAirport]);
```

### SVG 레이어 순서

SVG는 나중에 그린 요소가 위에 표시된다. 아래 순서를 반드시 지킨다.

1. `<rect>` — 검은 배경
2. 행정동 경계 (clipPath 적용)
3. 해안선 (clipPath 적용)
4. 존 원 (8 / 16 / 32km)
5. 낙뢰 마커
6. 공항 아이콘 ✈

### SVG 코드

```jsx
<svg viewBox={`0 0 ${size} ${size}`} ...>
  <defs>
    <clipPath id="map-clip">
      <circle cx={center} cy={center} r={center} />
    </clipPath>
  </defs>

  {/* 1. 배경 */}
  <rect x="0" y="0" width={size} height={size} rx="14" fill="#131a24" />

  {/* 2. 행정동 경계 */}
  <g clipPath="url(#map-clip)">
    {admDong && arp && geoToSVGPaths(admDong, arp, size, rangeKm).map(({ key, d }) => (
      <path key={key} d={d} fill="none"
        stroke="#1e3a4a" strokeWidth="0.4" strokeOpacity="0.7" />
    ))}
  </g>

  {/* 3. 해안선 */}
  <g clipPath="url(#map-clip)">
    {coastline && arp && geoToSVGPaths(coastline, arp, size, rangeKm).map(({ key, d }) => (
      <path key={key} d={d} fill="none"
        stroke="#00cc66" strokeWidth="0.9" strokeOpacity="0.55" />
    ))}
  </g>

  {/* 4. 존 원 */}
  {ZONE_RADII_KM.map((zone) => ( /* 기존 코드 */ ))}

  {/* 5. 낙뢰 */}
  {visibleStrikes.map((strike, idx) => ( /* 기존 코드 */ ))}

  {/* 6. 공항 아이콘 */}
  <text x={center} y={center + 5} textAnchor="middle" fontSize="18" fill="#fff">✈</text>
</svg>
```

---

## 레이어 스타일 가이드

| 레이어 | stroke | strokeWidth | strokeOpacity |
|--------|--------|-------------|---------------|
| 행정동 경계 | `#1e3a4a` (어두운 청록) | 0.4 | 0.7 |
| 해안선 | `#00cc66` (레이더 그린) | 0.9 | 0.55 |

> 해안선이 너무 강하면 `strokeOpacity` 0.4로 낮추고, 행정동이 안 보이면 0.9로 올리면서 조절한다.

---

## CLI 작업 순서 요약

```bash
# 1. 파일을 프로젝트 루트에 복사 (이미 완료)
#    map.geojson / coastline.geojson

# 2. 슬라이스 스크립트 생성
mkdir -p scripts
# scripts/sliceGeoJSON.js 파일 생성 (위 코드 그대로)

# 3. 슬라이스 실행 → public/geo/ 에 16개 파일 생성
node scripts/sliceGeoJSON.js

# 4. 유틸 파일 생성
# src/utils/geoToSVG.js 생성 (위 코드 그대로)

# 5. LightningMap.jsx 수정
#    - useState 2개 추가
#    - useEffect 추가
#    - SVG 레이어 추가

# 6. 브라우저 확인 후 strokeOpacity / strokeWidth 조절
```
# KMA Aviation Weather Dashboard
## 낙뢰 맵 행정동/시군구 경계 표시 — 구현 문서

---

## 개요

`LightningMap` 컴포넌트에 행정동/시군구 경계를 SVG 레이어로 덧씌워 위치 맥락을 제공한다.

- 행정동 폴리곤이 해안선도 경계로 포함하므로, `fill="#1e2d3d"` (육지색) + `stroke="#00cc66"` 으로 그리면 육지/해양 구분 + 행정동/시군구 경계 + 해안선이 동시에 표시된다. `coastline.geojson`은 사용하지 않는다.
- 경계 단위는 설정에서 **시군구**(기본) / **행정동**(상세) 선택 가능.
- 지도는 32km 원이 아닌 **정사각형 패널 전체**에 표시 (모서리까지 ≈45km 커버).
- 공항 아이콘(✈)은 `shared/airports.js`의 `runway_hdg` 기준으로 회전.

---

## 대상 공항

`shared/airports.js`에서 `mock_only: true`가 아닌 공항 8개를 자동 로드한다.
하드코딩된 좌표를 사용하지 않는다.

| ICAO | 공항명 | runway_hdg |
|------|--------|-----------|
| RKSI | 인천국제공항 | 150° |
| RKSS | 김포국제공항 | 140° |
| RKPC | 제주국제공항 | 70° |
| RKPK | 김해국제공항 | 180° |
| RKJB | 무안국제공항 | 10° |
| RKNY | 양양국제공항 | 150° |
| RKPU | 울산공항 | 180° |
| RKJY | 여수공항 | 170° |

---

## 파일 구조

```
KMA_weather_dashboard/
├── map.geojson                          ← 원본 행정동 (33MB, git 제외)
├── shared/
│   └── airports.js                      ← ARP 좌표 + runway_hdg 포함
├── backend/
│   └── test/
│       └── sliceGeoJSON.js              ← 빌드 전 1회 실행 스크립트
├── frontend/
│   ├── public/
│   │   └── geo/
│   │       ├── RKSI_admdong.geojson     ← 행정동 (619 features)
│   │       ├── RKSI_sigungu.geojson     ← 시군구 dissolved (50 features)
│   │       └── ... (공항별 각 2개, 총 16개)
│   └── src/
│       ├── components/
│       │   ├── LightningMap.jsx
│       │   └── alerts/
│       │       └── AlertSettings.jsx    ← 경계 단위 설정 포함
│       └── utils/
│           ├── helpers.js               ← toCanvasXY export 포함
│           └── geoToSVG.js              ← GeoJSON → SVG path 변환
└── package.json                         ← @turf/union devDependency
```

---

## 슬라이스 스크립트

**위치**: `backend/test/sliceGeoJSON.js`
**실행**: 루트 디렉토리에서 `node backend/test/sliceGeoJSON.js`

### 동작

1. `shared/airports.js`에서 `mock_only`가 아닌 공항 목록 로드
2. 각 공항 ARP 기준 **48km bbox** (32km × PADDING 1.5) 로 `map.geojson` 필터링
   (정사각형 패널 모서리 ≈45km 커버를 위해 padding 1.5 사용)
3. `_admdong.geojson`: bbox 내 행정동 feature 그대로 저장
4. `_sigungu.geojson`: `properties.sgg` (5자리 시군구 코드) 기준으로 `@turf/union` dissolve 후 저장

### @turf/union v7 API

v7에서 API가 변경됨 — `union(fc)` 형태로 `FeatureCollection`을 단일 인자로 받는다.

```js
const fc = { type: 'FeatureCollection', features: group };
const result = union(fc); // v7 API (v6의 union(feat1, feat2) 아님)
```

`@turf/union`은 `devDependencies`에만 추가 (빌드 스크립트 전용):

```json
"devDependencies": {
  "@turf/union": "^7.3.4"
}
```

### 생성 결과 (기준)

| ICAO | 행정동 | 시군구 |
|------|--------|--------|
| RKSI | 619 | 50 |
| RKSS | 1097 | 78 |
| RKPC | 43 | 2 |
| RKPK | 425 | 36 |
| RKJB | 220 | 21 |
| RKNY | 57 | 9 |
| RKPU | 260 | 24 |
| RKJY | 181 | 17 |

> 빌드 전 한 번만 실행. 공항 ARP나 경계 데이터가 바뀌지 않는 한 재실행 불필요.

---

## 좌표 변환: `toCanvasXY`

`frontend/src/utils/helpers.js`에 export되어 있다. `LightningMap.jsx`와 `geoToSVG.js` 모두 이 함수를 사용한다.

```js
export function toCanvasXY(point, arp, size, rangeKm) {
  const center = size / 2;
  const scale = center / rangeKm;
  const dLonKm = (point.lon - arp.lon) * 111.32 * Math.cos((arp.lat * Math.PI) / 180);
  const dLatKm = (point.lat - arp.lat) * 111.32;
  return { x: center + dLonKm * scale, y: center - dLatKm * scale };
}
```

---

## GeoJSON → SVG Path 변환 유틸

**위치**: `frontend/src/utils/geoToSVG.js`

```js
import { toCanvasXY } from './helpers';

export function geoToSVGPaths(geojson, arp, size, rangeKm) {
  const results = [];
  geojson.features.forEach((feature, fi) => {
    const geom = feature.geometry;
    let rings = geom.type === 'Polygon' ? geom.coordinates
               : geom.type === 'MultiPolygon' ? geom.coordinates.flat(1) : [];
    rings.forEach((ring, ri) => {
      const d = ring.map((coord, i) => {
        const { x, y } = toCanvasXY({ lon: coord[0], lat: coord[1] }, arp, size, rangeKm);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ') + ' Z';
      results.push({ key: `${fi}-${ri}`, d });
    });
  });
  return results;
}
```

---

## LightningMap.jsx 구조

### Props

```jsx
function LightningMap({ lightningData, selectedAirport, airports, boundaryLevel = 'sigungu' })
```

- `airports`: `shared/airports.js` 공항 목록 (App.jsx에서 전달, `runway_hdg` 조회용)
- `boundaryLevel`: `'sigungu'` | `'admdong'` (AlertSettings에서 설정, localStorage 경유)

### 경계 GeoJSON 로드

```js
useEffect(() => {
  if (!selectedAirport) return;
  setAdmDong(null);
  fetch(`/geo/${selectedAirport}_${boundaryLevel}.geojson`)
    .then(r => r.json())
    .then(setAdmDong)
    .catch(() => {});
}, [selectedAirport, boundaryLevel]);
```

### SVG 레이어 순서

| # | 레이어 | 비고 |
|---|--------|------|
| 1 | `<rect>` 배경 | `fill="#131a24"` (바다색) |
| 2 | `<defs><clipPath>` | `<rect rx="14">` — 정사각형 패널 전체 |
| 3 | 행정동/시군구 경계 | `fill="#1e2d3d"` (육지), `stroke="#00cc66"`, `strokeOpacity="0.4"` |
| 4 | 존 원 (8/16/32km) | 점선 원 |
| 5 | 공항 아이콘 ✈ | `rotate(runway_hdg - 90, center, center)` |
| 6 | 낙뢰 마커 | 십자 선 |

> clipPath를 원(circle)이 아닌 `rect rx="14"`로 지정해 정사각형 패널 전체에 지도를 표시한다.

### 공항 아이콘 회전

✈ 이모지는 기본 방향이 동쪽(90°)이므로 `runway_hdg - 90`을 적용한다.

```jsx
<text
  transform={`rotate(${runwayHdg - 90}, ${center}, ${center})`}
  ...
>✈</text>
```

---

## 스타일 가이드

| 속성 | 값 | 비고 |
|------|----|------|
| fill | `#1e2d3d` | 육지색 (배경 `#131a24`이 바다색) |
| stroke | `#00cc66` | 레이더 그린 |
| strokeWidth | `0.6` | |
| strokeOpacity | `0.4` | |

---

## 경계 단위 설정

**AlertSettings.jsx** (디스플레이 설정 섹션) → localStorage `lightning_boundary` 키 저장
**App.jsx** → `boundaryLevel` state, `handleSettingsChange`에서 localStorage 읽어 갱신
**LightningMap.jsx** → `boundaryLevel` prop으로 수신, useEffect 의존성에 포함

`metar_version` / `taf_version` 과 동일한 localStorage 패턴을 따른다.

---

## 성능 고려사항

- `map.geojson` (33MB)은 **빌드 스크립트 전용**. 서버/클라이언트 런타임에 로드되지 않는다.
- 슬라이스된 `_sigungu.geojson`은 공항당 수십 KB 수준으로, 브라우저 부하 없음.
- 생성된 `frontend/public/geo/*.geojson`은 Vite dev 서버에서 `/geo/` 경로로 서빙되고, 프로덕션 빌드 시 `dist/geo/`로 복사된다.

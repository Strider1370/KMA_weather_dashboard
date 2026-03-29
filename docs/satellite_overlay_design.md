<!-- NOTE: This document is encoded in UTF-8. Open/read/write using UTF-8 to avoid mojibake. -->

# GK2A 위성 영상 오버레이 설계 문서

> KMA API Hub에서 GK2A/AMI 위성 관측 NetCDF(HDF5) 파일을 주기 수집하여
> LCC 역투영 PNG로 변환한 뒤, InteractiveMap의 ImageOverlay로 표출한다.

---

## 1. 개요

### 1.1 목적

천리안위성 2A호(GK-2A) AMI 센서의 한반도 영역(KO) 관측 자료를
InteractiveMap 패널에 반투명 위성 영상 레이어로 추가한다.
기존 레이더 에코 오버레이와 동일한 파이프라인 패턴(수집 → 파싱/재투영 → PNG 저장 → ImageOverlay)을 따른다.

### 1.2 범위

- 백엔드: 위성 NC 수집 프로세서 + 파서 (LCC→WGS84 재투영 PNG 생성)
- 프론트엔드: InteractiveMap에 위성 레이어 토글 + 투명도 조절 추가
- 채널: 초기 구현은 IR105(적외 10.5μm, 24시간 사용 가능) 기본, 추후 채널 선택 확장 가능

---

## 2. 데이터 소스

### 2.1 API 엔드포인트

```
GET https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B/{채널}/{영역}/data?date={yyyymmddHHMM}&authKey={key}
```

- 응답: NetCDF4(HDF5) 바이너리 파일
- 인증: 기존 `API_AUTH_KEY` 환경변수 사용

### 2.2 요청 파라미터

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| 채널 | `IR105` | 적외 10.5μm (깨끗한 대기창, 24h 사용 가능) |
| 영역 | `KO` | 한반도 |
| date | `yyyymmddHHMM` | 관측 시각 (10분 단위) |

### 2.3 사용 가능 채널 목록

| 코드 | 파장 | 용도 | 비고 |
|------|------|------|------|
| VI004 | 0.47μm | 가시(파랑) | 주간 전용 |
| VI005 | 0.51μm | 가시(초록) | 주간 전용 |
| VI006 | 0.64μm | 가시(빨강) | 주간 전용, 가장 직관적 |
| VI008 | 0.86μm | 가시(식생) | 주간 전용 |
| NR013 | 1.37μm | 근적외(권운) | |
| NR016 | 1.6μm | 근적외(눈/얼음) | |
| SW038 | 3.8μm | 단파적외(야간안개/하층운) | |
| WV063 | 6.3μm | 수증기(상층) | |
| WV069 | 6.9μm | 수증기(중층) | |
| WV073 | 7.3μm | 수증기(하층) | |
| IR087 | 8.7μm | 적외(구름상) | |
| IR096 | 9.6μm | 적외(오존) | |
| **IR105** | **10.5μm** | **적외(깨끗한 대기창)** | **기본 채널** |
| IR112 | 11.2μm | 적외(대기창) | |
| IR123 | 12.3μm | 적외(오염된 대기창) | |
| IR133 | 13.3μm | 적외(이산화탄소) | |

### 2.4 영역별 해상도

| 영역 | 코드 | 해상도 | 격자 크기 |
|------|------|--------|-----------|
| 전구 | FD | 2km | 5500×5500 |
| 동아시아 | EA | 2km | 1800×1800 |
| 확장지역 | ELA | 2km | 2200×1800 |
| **한반도** | **KO** | **2km** | **900×900** |

---

## 3. NetCDF 파일 명세

### 3.1 파일 포맷

- 컨테이너: HDF5 (NetCDF4)
- 파싱 라이브러리: **h5wasm** (WebAssembly 기반, 네이티브 빌드 불필요)

### 3.2 파일명 규칙

```
gk2a_ami_le1b_{채널}_{영역}{해상도}lc_{yyyymmddHHMM}.nc
```

예시: `gk2a_ami_le1b_ir105_ko020lc_202210272350.nc`

- `ko020lc`: 한반도(KO), 2.0km 해상도, Lambert Conformal 투영

### 3.3 데이터 구조

```
Root
├── dim_y (dimension: 900)
├── dim_x (dimension: 900)
└── image_pixel_values (Uint16Array, shape: [900, 900])
```

### 3.4 주요 글로벌 속성

| 속성 | 값 | 설명 |
|------|-----|------|
| projection_type | lambert_conformal_conic | 투영법 |
| standard_parallel1 | 30 | 표준위선 1 (°N) |
| standard_parallel2 | 60 | 표준위선 2 (°N) |
| origin_latitude | 38 | 기준 위도 (°N) |
| central_meridian | 126 | 기준 경도 (°E) |
| false_easting | 0 | 가산 동향 (m) |
| false_northing | 0 | 가산 북향 (m) |
| image_width | 900 | 가로 픽셀 수 |
| image_height | 900 | 세로 픽셀 수 |
| pixel_size | 2000 | 격자 간격 (m) |
| upper_left_easting | -899000 | 좌상단 동향좌표 (m) |
| upper_left_northing | 899000 | 좌상단 북향좌표 (m) |
| satellite_name | GK-2A | 위성명 |
| instrument_name | AMI | 센서명 |

### 3.5 픽셀 데이터 속성

| 속성 | 값 | 설명 |
|------|-----|------|
| number_of_total_bits_per_pixel | 16 | 저장 비트 |
| number_of_valid_bits_per_pixel | 11 | 유효 비트 (0–2047) |
| channel_name | (채널별) | 채널 식별자 |

---

## 4. 투영 및 좌표 변환

### 4.1 LCC 투영 파라미터

레이더 에코(`radar-echo-parser.js`)와 **완전히 동일한 LCC 파라미터**를 사용한다.

| 파라미터 | 값 | 레이더 에코 동일 여부 |
|---------|-----|---------------------|
| φ₁ (표준위선 1) | 30°N | O |
| φ₂ (표준위선 2) | 60°N | O |
| φ₀ (기준위도) | 38°N | O |
| λ₀ (중심경도) | 126°E | O |
| R (지구반경) | 6,371,009 m | O (6371.00877 km) |

### 4.2 좌표계 차이점

레이더 에코와 LCC 파라미터는 동일하나 **좌표 표현 방식이 다르다**:

| | 레이더 에코 | 위성 NC |
|---|-----------|---------|
| 입력 좌표 | 격자 인덱스 (x, y) | easting/northing (m) |
| 기준점 | GRID_X0=1120, GRID_Y0=1680 | UL easting=-899000, UL northing=899000 |
| 격자 간격 | 0.5 km | 2.0 km |
| 격자 크기 | 2305×2881 | 900×900 |

### 4.3 역투영 수식 (easting/northing → lat/lon)

```
n = ln(cos φ₁ / cos φ₂) / ln(tan(π/4 + φ₂/2) / tan(π/4 + φ₁/2))
F = cos(φ₁) · tan(π/4 + φ₁/2)^n / n
ρ₀ = R · F / tan(π/4 + φ₀/2)^n

주어진 (easting, northing):
  dy = ρ₀ - northing
  ρ  = sign(n) · √(easting² + dy²)
  θ  = atan2(easting, dy)
  lat = 2 · atan((R·F/ρ)^(1/n)) - π/2
  lon = θ/n + λ₀
```

### 4.4 순투영 수식 (lat/lon → easting/northing)

```
주어진 (lat, lon):
  ρ = R · F / tan(π/4 + lat/2)^n
  θ = n · (lon - λ₀)
  easting  = ρ · sin(θ)
  northing = ρ₀ - ρ · cos(θ)
```

### 4.5 픽셀 → easting/northing 변환

```
easting  = upper_left_easting  + col × pixel_size
northing = upper_left_northing - row × pixel_size
```

### 4.6 검증된 코너 좌표

| 코너 | easting (m) | northing (m) | lat | lon |
|------|-------------|--------------|-----|-----|
| UL (0,0) | -899,000 | 899,000 | 45.72°N | 113.96°E |
| UR (899,0) | 899,000 | 899,000 | 45.72°N | 138.04°E |
| LL (0,899) | -899,000 | -899,000 | 29.33°N | 116.73°E |
| LR (899,899) | 899,000 | -899,000 | 29.33°N | 135.27°E |
| Center (450,450) | 1,000 | 1,000 | 37.99°N | 126.01°E |

> 프로젝트 GeoJSON 경계(시도/시군구, FIR)와 오버레이 정합이 실측 검증됨.

---

## 5. PNG 렌더링 파이프라인

### 5.1 개요

```
NC 파일 (LCC 격자 900×900, Uint16)
  ↓ h5wasm 파싱
  ↓ 퍼센타일 스트레칭 + 감마 보정
  ↓ LCC → Web Mercator 재투영
  ↓ sharp PNG 압축
  ↓
backend/data/satellite/sat_korea_{tm}.png + sat_meta.json
```

### 5.2 재투영 방식

레이더 에코의 `renderFullCoverageEcho`와 동일한 역방향 매핑 방식:

1. 출력 PNG의 각 픽셀 (px, py)에 대해
2. Web Mercator → lat/lon 역산
3. lat/lon → LCC easting/northing 순투영
4. easting/northing → 소스 NC 픽셀 인덱스 변환
5. 최근접 이웃(nearest neighbor) 샘플링으로 픽셀 값 취득

### 5.3 밝기 보정

NC 원시 픽셀 값은 분포가 낮은 쪽에 편향되어 있어 선형 매핑 시 영상이 매우 어둡다.
KMA 공식 위성 영상과 유사한 출력을 위해 **퍼센타일 스트레칭 + 감마 보정**을 적용한다.

```javascript
// 1. 퍼센타일 스트레칭 (P1 ~ P99)
const sorted = Array.from(data).sort((a, b) => a - b);
const lo = sorted[Math.floor(len * 0.01)];  // P1
const hi = sorted[Math.floor(len * 0.99)];  // P99

// 2. 정규화 + 감마 보정
let v = (pixel - lo) / (hi - lo);           // 0~1 범위
v = Math.max(0, Math.min(1, v));
v = Math.pow(v, gamma);                     // gamma = 0.6
const brightness = Math.round(v * 255);
```

| 단계 | P50 → 밝기 |
|------|-----------|
| 선형 매핑 (max=569) | 60/255 (매우 어두움) |
| P1-P99 스트레칭 | 134/255 |
| + 감마 0.6 | ~180/255 (KMA 공식 영상과 유사) |

### 5.4 출력 사양

| 항목 | 값 |
|------|-----|
| 출력 해상도 | 1200 × ~1050 (종횡비 자동) |
| 색상 | 그레이스케일 RGBA |
| 알파 | 200 (반투명, 프론트에서 opacity 추가 조절) |
| 포맷 | PNG (sharp, compressionLevel: 3) |
| Leaflet bounds | `[[29.3, 114.0], [45.8, 138.0]]` |

---

## 6. 백엔드 구현

### 6.1 파일 구성

```
backend/src/
├── processors/satellite-processor.js   ← 수집 + 스케줄
├── parsers/satellite-parser.js         ← NC 파싱 + 재투영 PNG 생성
```

### 6.2 satellite-parser.js

주요 export:

```javascript
module.exports = {
  parseSatelliteNC,         // Buffer → { data, width, height, attrs }
  renderSatelliteImage,     // parsed → { pngBuffer, bounds, width, height }
};
```

- `parseSatelliteNC(buffer)`: h5wasm으로 NC 바이너리를 파싱, 픽셀 데이터(Uint16Array) + 투영 속성 반환
- `renderSatelliteImage(parsed)`: LCC→Mercator 재투영 + 밝기 보정 + sharp PNG 생성

### 6.3 satellite-processor.js

```javascript
const { processAll } = require("./satellite-processor");
// 스케줄러에서 runWithLock("satellite", processAll) 호출
```

동작 흐름:
1. 현재 시각 기준 최신 관측 시각 계산 (10분 단위 버림)
2. KMA API에 NC 파일 요청
3. `parseSatelliteNC` → `renderSatelliteImage` 호출
4. `backend/data/satellite/sat_korea_{tm}.png` 저장
5. `backend/data/satellite/sat_meta.json` 메타데이터 갱신

### 6.4 메타데이터 파일

`backend/data/satellite/sat_meta.json`:

```json
{
  "type": "satellite",
  "channel": "IR105",
  "region": "KO",
  "updated_at": "2026-03-29T12:30:00Z",
  "tm": "202603291230",
  "frames": [
    {
      "tm": "202603291230",
      "path": "/data/satellite/sat_korea_202603291230.png",
      "bounds": [[29.3, 114.0], [45.8, 138.0]],
      "width": 1200,
      "height": 1049,
      "channel": "IR105"
    }
  ]
}
```

### 6.5 스케줄

```javascript
SATELLITE: "*/10 * * * *"   // 10분 주기 (GK2A 관측 주기와 동일)
```

### 6.6 API 엔드포인트

`server.js`에 추가:

```
GET /api/satellite → backend/data/satellite/sat_meta.json
```

정적 PNG는 기존 `/data/*` 라우트로 자동 서빙:

```
GET /data/satellite/sat_korea_{tm}.png
```

### 6.7 환경변수

```env
# .env (optional overrides)
SATELLITE_API_URL=https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B
SATELLITE_CHANNEL=IR105
SATELLITE_REGION=KO
```

---

## 7. 프론트엔드 구현

### 7.1 데이터 폴링

`App.jsx`의 기존 snapshot polling 루프에 satellite 메타데이터 폴링 추가:

```javascript
const satMeta = await fetchJsonOptional("/api/satellite");
```

### 7.2 InteractiveMap 통합

레이더 에코 오버레이와 동일한 패턴:

```jsx
{showSatellite && satInfo && (
  <Pane name="satellite-pane" style={{ zIndex: 390 }}>
    <ImageOverlay
      url={satInfo.url}
      bounds={satInfo.bounds}
      opacity={satelliteOpacity}
    />
  </Pane>
)}
```

### 7.3 레이어 순서 (zIndex)

| 레이어 | zIndex |
|--------|--------|
| **Satellite (신규)** | **390** |
| Radar echo | 400 |
| Radar coverage boundary | 420 |
| Admin boundary (sido/sigungu) | 430-440 |
| Lightning / SIGWX / Traffic | 450+ |

> 위성은 레이더 에코보다 아래에 배치하여, 레이더 에코가 위에 보이도록 한다.

### 7.4 토글 UI

지도 우상단 패널 토글 영역에 `위성` 체크박스 추가.
투명도는 기존 레이더 투명도 슬라이더와 별도 또는 공유 가능 (구현 시 결정).

---

## 8. 히스토리/루프 (향후 확장)

레이더 에코와 동일하게 최근 N 프레임을 저장하여 애니메이션 루프 지원 가능.

- 보관 프레임 수: 최근 6~12개 (1~2시간)
- `sat_meta.json`의 `frames` 배열에 시간순 누적
- 프론트엔드 타임라인 슬라이더 또는 play/pause 컨트롤

초기 구현에서는 **단일 최신 프레임만** 지원하고, 루프는 별도 이터레이션에서 추가한다.

---

## 9. 의존성

| 패키지 | 용도 | 설치 위치 |
|--------|------|-----------|
| **h5wasm** | NetCDF4(HDF5) 파싱 | root package.json (이미 설치됨) |
| sharp | PNG 렌더링 | root package.json (기존) |
| pngjs | (대안) PNG 생성 | root package.json (기존) |

> h5wasm은 WebAssembly 기반으로 네이티브 컴파일이 불필요하며, NC 파일(~800KB)을 메모리에서 직접 파싱한다.

---

## 10. 테스트

### 10.1 수집기 테스트

```bash
node backend/test/run-once.js satellite
```

`backend/test/run-once.js`에 `satellite` 타깃 추가 필요.

### 10.2 검증 항목

- [ ] NC 파일 다운로드 및 h5wasm 파싱 성공
- [ ] 투영 파라미터(LCC) 정상 추출
- [ ] 재투영 PNG 생성 및 bounds 정합 (GeoJSON 경계와 오버레이 일치)
- [ ] 밝기 보정 결과가 KMA 공식 위성 영상과 시각적으로 유사
- [ ] `sat_meta.json` 정상 기록
- [ ] 프론트엔드 ImageOverlay 정상 표출
- [ ] 토글 on/off + 투명도 조절 동작
- [ ] 다크 모드에서 시각적 이상 없음

---

## 11. 체크리스트

- [ ] `backend/src/parsers/satellite-parser.js` 구현
- [ ] `backend/src/processors/satellite-processor.js` 구현
- [ ] `backend/src/config.js`에 SATELLITE 스케줄 추가
- [ ] `backend/src/index.js`에 satellite cron job 등록
- [ ] `server.js`에 `/api/satellite` 엔드포인트 추가
- [ ] `backend/test/run-once.js`에 satellite 타깃 추가
- [ ] `frontend/src/components/InteractiveMap.jsx`에 위성 레이어 추가
- [ ] `frontend/src/App.jsx`에 satellite 폴링 추가
- [ ] 지도 패널 토글 UI에 위성 체크박스 추가
- [ ] `AGENTS.md` / `README.md` 업데이트

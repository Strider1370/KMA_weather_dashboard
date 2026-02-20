<!-- NOTE: This document is encoded in UTF-8. Open/read/write using UTF-8 to avoid mojibake. -->

# 레이더 합성장 → LightningMap 오버레이 설계 문서

> KMA 레이더 합성 이진자료(CPP)를 파싱하여 공항별 480×480 PNG 타일로 변환,
> LightningMap SVG 위에 반투명 레이더 합성장을 중첩 표시한다.

---

## 1. 개요

### 1.1 목적

현재 `RadarPanel`은 KMA API의 PNG 이미지(`data=img`)를 전국 단위로 표출한다.
이 설계는 **이진 포맷 레이더 합성자료(`data=bin`)** 를 수집하여, 각 공항을 중심으로
한 **480×480 픽셀 등장방형 PNG 타일**로 변환하고, `LightningMap` SVG의
기존 레이어 위에 투명도 조절 가능한 레이더 색상 오버레이로 덧씌운다.

---

## 2. 이진 포맷 명세 (RDR_CMP_CPP_PUB)

### 2.1 파일명 규칙

```
RDR_CMP_CPP_PUB_YYYYMMDDHHmm.bin.gz
```

### 2.2 투영 및 격자 정보

| 항목 | 값 |
|------|-----|
| 투영법 | Lambert Conformal Conic (LCC) |
| 기준 위도 (φ₀) | 38.0°N |
| 기준 경도 (λ₀) | 126.0°E |
| 표준위선 1 (φ₁) | 30.0°N (KMA 표준) |
| 표준위선 2 (φ₂) | 60.0°N (KMA 표준) |
| 지구 반경 (R) | 6371.00 km |
| 격자 해상도 | 500 m (0.5 km) |
| 격자수 (X × Y) | 2305 × 2881 |
| 기준격자점 (0-indexed) | col₀ = 1120, row₀ = 1200 |
| 데이터 저장 순서 | **남(South) → 북(North)** (row=0 이 최남단) |

> **주의 1**: `ROW0 = 1200`은 북위 38도 기준점이 격자의 최상단(북쪽)으로부터 600km(1200격자) 지점에 위치함을 의미한다. (기존 1680은 남쪽 기준 좌표임)
> **주의 2**: 데이터 저장 순서가 이미지 좌표계(Top-to-Bottom)와 반대이므로, 렌더링 시 `ny - 1 - row`로 인덱스를 역전시켜야 상하 반전을 방지할 수 있다.
> **주의 3**: 표준위선(φ₁, φ₂)은 이진 헤더에 명시되지 않으므로 KMA 공식 문서 기준값 (30°N/60°N)을 사용한다.

### 2.3 파일 구조

```
[ 헤더          1024 bytes ]
[ 반사도 블록   2 × 2305 × 2881 bytes ]  ← short int, dBZ × 100
[ 고도 블록     2 × 2305 × 2881 bytes ]  ← short int, m (사용 안 함)
[ 지점 블록     2 × 2305 × 2881 bytes ]  ← short int (사용 안 함)
```

### 2.4 반사도(dBZ) → 강우강도(mm/h) 변환

공식 영상(`RDR_CMB`)과 동일한 시각적 표현을 위해 Marshall-Palmer 관계식을 사용한다.
- $Z = 200 \cdot R^{1.6}$
- $R = \left(\frac{10^{(dBZ/10)}}{200}\right)^{1/1.6}$ (단위: mm/h)
- 0.05 mm/h 미만은 무강수로 간주하여 투명 처리.

---

## 3. 좌표 변환 및 샘플링

### 3.1 LCC 순방향 투영: (lat, lon) → 격자 (col, row)

공항 ARP 또는 특정 위경도를 KMA LCC 격자 인덱스로 변환한다. **서버 기동 시 1회 계산**하여 공항별 (col, row) 캐시.

```js
const LCC_PARAMS = {
  phi1:    30.0 * Math.PI / 180,
  phi2:    60.0 * Math.PI / 180,
  phi0:    38.0 * Math.PI / 180,
  lambda0: 126.0 * Math.PI / 180,
  R:       6371.0,
  col0:    1120,
  row0:    1200, // 정정된 기준점 (Top-down 기준)
  dxy_km:  0.5,
};

function lccForward(lat_deg, lon_deg, p = LCC_PARAMS) {
  // ... (투영 공식 생략) ...
  const col = p.col0 + x_km / p.dxy_km;
  const row = p.row0 - y_km / p.dxy_km; // 북쪽 0, 남쪽으로 증가
  return { col, row };
}
```

### 3.2 정밀 샘플링 (Bilinear Interpolation)

단순 격자 매핑 시 발생하는 블록 현상을 방지하기 위해 주변 4개 격자점을 가중 평균하여 샘플링한다. 샘플링 시 원시 데이터의 `short int` 값을 **100으로 나누어 dBZ 단위로 보정**해야 한다.

---

## 4. 백엔드 및 인프라 구현 상세

### 4.1 정적 자산 서빙 (Cache Busting 대응)

브라우저 캐시 방지를 위해 `/data/radar-tiles/TST1_latest.png?t=12345`와 같이 요청할 경우, 서버는 쿼리 스트링을 분리하고 순수 파일 경로로 매핑해야 한다.

```javascript
function serveDataAsset(req, res) {
  const urlPath = req.url.split('?')[0]; // Query string 제거 필수
  const relative = urlPath.replace(/^\/data\//, "");
  const filePath = path.normalize(path.join(DATA_ROOT, relative));
  // ...
}
```

---

## 5. 프론트엔드 통합 전략

### 5.1 동적 축척(Range) 동기화

레이더 타일은 ±45km 영역을 담고 있으므로, `LightningMap`은 레이더 활성화 시 가시 범위를 동적으로 조정해야 한다.

*   **Radar OFF**: `rangeKm = 32` (표준 낙뢰 반경)
*   **Radar ON**: `rangeKm = 45` (레이더 타일 해상도 일치)

### 5.2 렌더링 스타일

에코의 부드러운 전이를 위해 SVG `<image>` 요소에 `image-rendering: auto`를 적용한다. (`pixelated` 스타일은 정밀 보간 효과를 저해함)

---

## 6. 레이더 색상 스케일 (mm/h)

KMA 공식 영상(`RDR_CMB`) 우측 범례의 **24단계 강우 강도 색상**을 정밀하게 추출하여 적용한다.

| mm/h 범위 | RGBA | 비고 |
|-----------|------|------|
| < 0.05 | `(255, 255, 255, 0)` | 무강수 (투명) |
| 0.05 ~ 0.1 | `(176, 236, 255, 120)` | 아주 연한 하늘 |
| 0.5 ~ 1.0 | `(60, 160, 255, 180)` | 하늘색 |
| 1.0 ~ 2.0 | `(0, 255, 0, 255)` | 녹색 |
| 5.0 ~ 6.0 | `(255, 255, 0, 255)` | 노랑 |
| 10.0 ~ 15.0 | `(255, 0, 0, 255)` | 빨강 |
| 30.0 ~ 40.0 | `(255, 148, 255, 255)` | 분홍 |
| 110.0 ~ 150.0 | `(20, 20, 152, 255)` | 진한 남색 |

> 전체 24단계 색상값은 `backend/test/generate-full-radar.js:mmhToRGBA` 참조.

---

최종 업데이트: 2026-02-20

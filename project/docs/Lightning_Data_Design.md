# 낙뢰 정보 수집 및 표출 설계문서

## 1. 개요

### 1.1 목적

공항 주변 낙뢰 발생을 실시간 모니터링하여, 데이터 수집 → 거리 분류 → JSON 저장 → 지도 표출 + 알림 트리거 연동까지 처리하는 시스템.

### 1.2 용도

1. **감시 + 알림**: 공항 ARP 기준 8/16/32km 3단계 거리 분류로 경보/위험/주의 알림
2. **지도 표출**: 공항 중심 동심원 + 낙뢰 위치 마커 (시간별 5분 단위 색상)

### 1.3 핵심 설계 원칙

- **API 1회 호출 (32km)** + Haversine 거리 계산으로 8/16/32km 분류
- **내부 처리는 UTC**, 표출은 KST
- **기준점은 ARP** (Aerodrome Reference Point)
- **뇌우경보 기준 연동**: 8km 이내 = 경보 (기상청 뇌우경보 기준과 동일)

---

## 2. API 분석

### 2.1 요청 파라미터

| 파라미터 | 의미 | 예시 | 비고 |
|---------|------|------|------|
| `tm` | 기준 시각 (KST) | `202602101430` | YYYYMMDDHHmm |
| `itv` | 시간 간격 (분) | `10` | 기준 시각 **전후** N분 |
| `lon` | 중심 경도 | `126.4407` | ARP 경도 |
| `lat` | 중심 위도 | `37.4602` | ARP 위도 |
| `range` | 반경 | `32` | km — 항상 32km로 고정 호출 |
| `gc` | 좌표 타입 | `T` | T 고정 |
| `authKey` | 인증키 | `boxdzlyoTGWMXc5cqDxlQQ` | 공통 키 |

**주의**: `itv`는 기준 시각 전후 양방향이다.
- `tm=202602101430, itv=10` → 14:20 ~ 14:40 범위의 낙뢰 반환

### 2.2 응답 형식

텍스트 기반 (XML/JSON 아님). 고정폭 공백 구분.

```
#START7777
# (헤더 주석)
#           TM     LON     LAT      ST T    HT
20250803171441 126.202  34.492    10.8 G   0.0
20250803171441 126.200  34.487    10.6 C   8.3
...
#7777END
```

### 2.3 필드 정의

| 필드 | 의미 | 타입 | 비고 |
|------|------|------|------|
| `TM` | 탐지 시각 (KST) | `YYYYMMDDHHmmss` | 14자리 |
| `LON` | 경도 | float | degree |
| `LAT` | 위도 | float | degree |
| `ST` | 강도 | float | kA (킬로암페어), 음수 = 음극성 |
| `T` | 종류 | char | `G` = 대지낙뢰, `C` = 운간방전 |
| `HT` | 고도 | float | km, C인 경우만 유효, G는 0.0 |

---

## 3. 수집 설계

### 3.1 폴링 전략

| 항목 | 값 | 근거 |
|------|---|------|
| 폴링 주기 | **3분** | 낙뢰는 안전 관련, 빠른 감지 필요 |
| 조회 간격(itv) | **3분** | 전후 3분 = 총 6분 범위, 3분 폴링과 동일 간격 |
| 기준 시각(tm) | 현재 KST | 매 폴링 시 계산 |
| 반경(range) | **32km** | 항상 32km로 호출, 이후 Haversine으로 분류 |
| 대상 | 8개 공항 전체 | 공항별 개별 호출 |

```
타임라인 (3분 폴링, itv=3분 = 전후 3분):

시각     14:00         14:03         14:06
          │              │              │
   ←3분→ tm ←3분→  ←3분→ tm ←3분→
   13:57~14:03     14:00~14:06     14:03~14:09

→ 3분 겹침으로 누락 방지
```

### 3.2 tm 파라미터 생성 (UTC → KST 변환)

내부는 UTC로 동작하지만, API의 tm은 KST로 보내야 한다:

```javascript
function getCurrentKstTm() {
    const now = new Date();
    // UTC + 9시간 = KST
    const kst = new Date(now.getTime() + 9 * 3600000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    const h = String(kst.getUTCHours()).padStart(2, "0");
    const min = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${y}${m}${d}${h}${min}`;  // "202602101430"
}
```

### 3.3 config.js 추가

```javascript
// api에 추가
api: {
    // 기존...
    lightning_url: "https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php"
},

// 새 섹션
lightning: {
    range_km: 32,              // API 호출 반경 (항상 32km)
    itv_minutes: 3,            // 전후 5분
    zones: {                   // 거리별 분류 기준
        alert: 8,              // 경보 (뇌우경보 기준)
        danger: 16,            // 위험
        caution: 32            // 주의
    }
},

// schedule에 추가
schedule: {
    // 기존...
    lightning_interval: "*/3 * * * *"   // 3분마다
}
```

### 3.4 ARP 좌표

shared/airports.js의 좌표를 ARP 기준으로 사용. 좌표는 사용자가 AIP 기준으로 입력:

```javascript
// shared/airports.js — ARP 좌표 (KOCA eAIP AD 2.2 기준, decimal degrees)
module.exports = [
    { icao: "RKSI", name: "인천공항", lat: 37.4625, lon: 126.4392 },  // ARP: 372745N 1262621E
    { icao: "RKSS", name: "김포공항", lat: 37.5569, lon: 126.7975 },  // ARP: 373325N 1264751E
    { icao: "RKPC", name: "제주공항", lat: 33.5122, lon: 126.4928 },  // ARP: 333044N 1262934E
    { icao: "RKPK", name: "김해공항", lat: 35.1806, lon: 128.9381 },  // ARP: 351050N 1285617E
    { icao: "RKJB", name: "무안공항", lat: 34.9914, lon: 126.3828 },  // ARP: 345929N 1262258E
    { icao: "RKNY", name: "양양공항", lat: 38.0614, lon: 128.6692 },  // ARP: 380341N 1284009E
    { icao: "RKPU", name: "울산공항", lat: 35.5933, lon: 129.3522 },  // ARP: 353536N 1292108E
    { icao: "RKJY", name: "여수공항", lat: 34.8422, lon: 127.6172 },  // ARP: 345032N 1273702E
];
```

---

## 4. 거리 계산 및 분류

### 4.1 Haversine 공식

ARP와 낙뢰 지점 간 거리(km)를 구면 거리로 계산:

```javascript
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;  // 지구 반지름 (km)
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * Math.PI / 180;
}
```

### 4.2 거리 기반 3단계 분류

API는 32km로 넓게 받고, 각 낙뢰에 distance_km + zone을 부여:

```javascript
function classifyStrike(strike, arp, zones) {
    const dist = haversineKm(arp.lat, arp.lon, strike.lat, strike.lon);
    let zone;

    if (dist <= zones.alert)       zone = "alert";     // ≤ 8km  경보
    else if (dist <= zones.danger) zone = "danger";     // ≤ 16km 위험
    else if (dist <= zones.caution) zone = "caution";   // ≤ 32km 주의
    else                           zone = "outside";    // > 32km (API 오차)

    return {
        ...strike,
        distance_km: Math.round(dist * 10) / 10,  // 소수점 1자리
        zone
    };
}
```

### 4.3 분류 기준

| zone | 거리 | 의미 | 알림 severity | 색상 |
|------|------|------|-------------|------|
| `alert` | ≤ 8km | 경보 (뇌우경보 기준) | critical | 빨강 #FF0000 |
| `danger` | ≤ 16km | 위험 | warning | 주황 #FF8800 |
| `caution` | ≤ 32km | 주의 | info | 노랑 #FFD700 |
| `outside` | > 32km | 범위 외 (무시) | — | — |

---

## 5. 파싱 설계

### 5.1 텍스트 파서

```javascript
// parsers/lightning-parser.js

function parse(responseText, airport) {
    const lines = responseText.split("\n");
    const strikes = [];
    const zones = config.lightning.zones;

    for (const line of lines) {
        if (line.startsWith("#") || line.trim() === "") continue;

        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;

        const [tm, lon, lat, st, type, ht] = parts;

        const strike = {
            time: kstToUtc(tm),               // UTC ISO 8601 (내부 저장)
            time_kst: kstToIso(tm),           // KST ISO 8601 (표출용)
            lon: parseFloat(lon),
            lat: parseFloat(lat),
            intensity: parseFloat(st),
            intensity_abs: Math.abs(parseFloat(st)),
            polarity: parseFloat(st) >= 0 ? "positive" : "negative",
            type: type,                       // "G" | "C"
            type_name: type === "G" ? "대지낙뢰" : "운간방전",
            height: type === "C" ? parseFloat(ht || "0") : null
        };

        // Haversine 거리 계산 + zone 분류
        const classified = classifyStrike(strike, airport, zones);
        if (classified.zone !== "outside") {
            strikes.push(classified);
        }
    }

    return strikes;
}
```

### 5.2 시간 변환

```javascript
// KST 14자리 → UTC ISO 8601
function kstToUtc(tm) {
    const y = tm.substring(0, 4);
    const m = tm.substring(4, 6);
    const d = tm.substring(6, 8);
    const h = tm.substring(8, 10);
    const min = tm.substring(10, 12);
    const sec = tm.substring(12, 14);
    const kst = new Date(`${y}-${m}-${d}T${h}:${min}:${sec}+09:00`);
    return kst.toISOString();  // UTC
}

// KST 14자리 → KST ISO 8601 (표출용)
function kstToIso(tm) {
    const y = tm.substring(0, 4);
    const m = tm.substring(4, 6);
    const d = tm.substring(6, 8);
    const h = tm.substring(8, 10);
    const min = tm.substring(10, 12);
    const sec = tm.substring(12, 14);
    return `${y}-${m}-${d}T${h}:${min}:${sec}+09:00`;
}
```

---

## 6. JSON 출력 구조

### 6.1 통합 JSON

```javascript
{
    type: "LIGHTNING",
    fetched_at: "2026-02-10T05:30:00Z",         // UTC
    query: {
        itv_minutes: 3,
        range_km: 32
    },
    airports: {
        "RKSI": {
            airport_name: "인천공항",
            arp: { lat: 37.4602, lon: 126.4407 },
            summary: {
                total_count: 15,
                by_zone: {
                    alert: 3,          // ≤ 8km
                    danger: 5,         // ≤ 16km
                    caution: 7         // ≤ 32km
                },
                by_type: {
                    ground: 10,        // G
                    cloud: 5           // C
                },
                max_intensity: 69.8,   // 절대값 기준
                latest_time: "2026-02-10T05:28:41Z"
            },
            strikes: [
                {
                    time: "2026-02-10T05:14:41Z",
                    time_kst: "2026-02-10T14:14:41+09:00",
                    lon: 126.202,
                    lat: 34.492,
                    intensity: 10.8,
                    intensity_abs: 10.8,
                    polarity: "positive",
                    type: "G",
                    type_name: "대지낙뢰",
                    height: null,
                    distance_km: 5.3,
                    zone: "alert"
                },
                // ...
            ]
        },
        // 낙뢰 없는 공항
        "RKNY": {
            airport_name: "양양공항",
            arp: { lat: 38.0613, lon: 128.6692 },
            summary: {
                total_count: 0,
                by_zone: { alert: 0, danger: 0, caution: 0 },
                by_type: { ground: 0, cloud: 0 },
                max_intensity: null,
                latest_time: null
            },
            strikes: []
        }
    }
}
```

### 6.2 저장

```
data/lightning/
  ├── latest.json
  └── LIGHTNING_{timestamp}.json
```

변경 감지: 전체 공항 total_count 합산이 0이면 저장 안 함, 1 이상이면 항상 저장.

---

---

## 7. 알림 연동

### 8.1 트리거 (T-08): 5분/8km 기준 Critical 알림

```javascript
{
    id: "lightning_detected",
    name: "낙뢰 감지 알림",
    category: "lightning",
    severity: "critical",
    params: {
        window_minutes: { type: "number", default: 5, unit: "분", label: "감시 시간" },
        max_distance_km: { type: "number", default: 8, unit: "km", label: "최대 거리" },
        min_count: { type: "number", default: 1, unit: "회", label: "최소 낙뢰 수" }
    },
    evaluate(current, previous, params) {
        const now = Date.now();
        const cutoff = now - params.window_minutes * 60 * 1000;

        // 최근 5분 + 8km 이내 낙뢰만 필터
        const filtered = current.strikes.filter(s =>
            new Date(s.time).getTime() >= cutoff &&
            Number(s.distance_km) <= params.max_distance_km
        );
        if (filtered.length < params.min_count) return null;

        // 이전에 없던 새 낙뢰만
        const prevKeys = new Set((previous?.strikes || []).map(strikeKey));
        const newStrikes = filtered.filter(s => !prevKeys.has(strikeKey(s)));
        if (newStrikes.length === 0) return null;

        const closestDist = Math.min(...newStrikes.map(s => s.distance_km));

        return {
            triggerId: "lightning_detected",
            severity: "critical",
            title: `⚡ 낙뢰 경보: 5분 이내 8km 탐지 ${newStrikes.length}건`,
            message: [
                `최근접: ${closestDist}km`,
                `조건: ${params.window_minutes}분 / ${params.max_distance_km}km`
            ].filter(Boolean).join(" | "),
            data: { newStrikes, closestDist }
        };
    }
}
```

### 8.2 alert-defaults.js 추가

```javascript
triggers: {
    // 기존 T-01 ~ T-07...
    lightning_detected: {
        enabled: true,
        params: {
            window_minutes: 5,
            max_distance_km: 8,
            min_count: 1,
        }
    }
}
```

---

## 8. 표출 설계

### 9.1 요약 정보 패널

**상시 표시**. 사이드바 또는 메인 화면에 항상 노출. 낙뢰가 없어도 표시.

```
낙뢰 없을 때:
  ⚡ 낙뢰 현황 (최근 30분)
  감지된 낙뢰 없음

낙뢰 있을 때:
  ⚡ 낙뢰 현황 (최근 30분)

  경보(8km):  ██ 3건
  위험(16km): ████ 5건
  주의(32km): ███████ 7건

  최근접: 4.2 km
  최근 감지: 14:38 KST
```

시간 범위(30분)는 지도의 시간 범위 컨트롤과 연동.

---

### 9.2 지도 표출

#### 기본 구조

배경 이미지 없이 좌표 기반 캔버스로 구성. 나중에 배경 이미지를 레이어로 깔 수 있는 구조.

```
┌─────────────────────────────────┐
│          (배경: 추후 이미지)      │
│                                 │
│       · · · 32km · · ·          │  ← 노랑 점선 원
│     ·                 ·         │
│    ·    · 16km ·       ·        │  ← 주황 점선 원
│    ·   ·         ·     ·        │
│    ·   · 8km  ·  ·     ·        │  ← 빨강 점선 원
│    ·   ·  ✈   ·  ·     ·        │  ← ARP 중심
│    ·   ·  +   ·  ·     ·        │  ← 낙뢰 마커
│    ·   · +  + ·  ·     ·        │
│    ·   ·       ·    +  ·        │
│     ·     +          ·         │
│       · · · · · · · ·          │
│                                 │
└─────────────────────────────────┘
```

#### 좌표 → 픽셀 변환

ARP를 캔버스 중심에 놓고, 위경도를 픽셀 좌표로 변환:

```javascript
// 캔버스 설정
const CANVAS_SIZE = 600;           // px (정사각형)
const RANGE_KM = 32;               // 표시 범위
const CENTER_PX = CANVAS_SIZE / 2; // 캔버스 중심 = ARP 위치

// 위경도 → 캔버스 px 변환
function toCanvasXY(strikeLat, strikeLon, arpLat, arpLon) {
    // 경도 차이 → km (위도에 따른 보정)
    const dLonKm = (strikeLon - arpLon) * 111.32 * Math.cos(arpLat * Math.PI / 180);
    // 위도 차이 → km
    const dLatKm = (strikeLat - arpLat) * 111.32;

    // km → px
    const scale = CENTER_PX / RANGE_KM;  // px per km
    const x = CENTER_PX + dLonKm * scale;  // 경도: 오른쪽이 +
    const y = CENTER_PX - dLatKm * scale;  // 위도: 위쪽이 + (캔버스는 아래가 +)

    return { x, y };
}

// km → 원 반지름 (px)
function kmToRadius(km) {
    return km * (CENTER_PX / RANGE_KM);
}
```

**핵심**: `111.32 km/degree`는 적도 기준이며, 경도는 `cos(위도)`로 보정. 한국 위도(33~38°)에서 충분한 정확도.

#### 동심원 그리기

```javascript
function drawZoneCircles(ctx) {
    const zones = [
        { km: 32, color: "#FFD700", label: "32km" },  // 주의
        { km: 16, color: "#FF8800", label: "16km" },  // 위험
        { km: 8,  color: "#FF0000", label: "8km" }    // 경보
    ];

    for (const zone of zones) {
        const r = kmToRadius(zone.km);
        ctx.beginPath();
        ctx.arc(CENTER_PX, CENTER_PX, r, 0, Math.PI * 2);
        ctx.strokeStyle = zone.color;
        ctx.setLineDash([8, 4]);  // 점선
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.stroke();

        // 라벨
        ctx.fillStyle = zone.color;
        ctx.globalAlpha = 0.8;
        ctx.fillText(zone.label, CENTER_PX + r + 4, CENTER_PX);
    }
}
```

#### ARP 마커

```javascript
function drawARP(ctx) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✈", CENTER_PX, CENTER_PX + 5);
}
```

#### 낙뢰 마커 (`+` 기호)

```javascript
function drawStrike(ctx, canvasX, canvasY, strike, colorInfo) {
    const { color, opacity } = colorInfo;

    // 크기: 강도 비례
    let size;
    if (strike.intensity_abs < 20)  size = 4;
    else if (strike.intensity_abs < 50) size = 7;
    else size = 10;

    // 굵기: G=굵게, C=얇게
    const lineWidth = strike.type === "G" ? 2.5 : 1.0;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = opacity;

    // + 그리기
    ctx.beginPath();
    ctx.moveTo(canvasX - size, canvasY);
    ctx.lineTo(canvasX + size, canvasY);
    ctx.moveTo(canvasX, canvasY - size);
    ctx.lineTo(canvasX, canvasY + size);
    ctx.stroke();
}
```

---

### 9.3 낙뢰 마커 규칙

**형태**: `+` 기호 (G/C 구분 없이 동일)
**크기**: 고정 (6px)
**색상**: 시간별 (9.4절)

```javascript
function drawStrike(ctx, canvasX, canvasY, colorInfo) {
    const { color, opacity } = colorInfo;
    const size = 6;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = opacity;

    ctx.beginPath();
    ctx.moveTo(canvasX - size, canvasY);
    ctx.lineTo(canvasX + size, canvasY);
    ctx.moveTo(canvasX, canvasY - size);
    ctx.lineTo(canvasX, canvasY + size);
    ctx.stroke();
}
```

---

### 9.4 시간별 색상 (5분 단위)

기준: 현재 시각 대비 낙뢰 발생 시각의 경과 시간

| 경과 시간 | 색상 | 의미 |
|----------|------|------|
| 0 ~ 5분 | 빨강 #FF0000 | 방금 발생 |
| 5 ~ 10분 | 주황 #FF6600 | 최근 |
| 10 ~ 15분 | 노랑 #FFCC00 | |
| 15 ~ 20분 | 연두 #99CC00 | |
| 20 ~ 30분 | 초록 #33AA33 | |
| 30 ~ 60분 | 파랑 #3366FF | 오래됨 |
| 60분 이상 | 회색 #999999 | 매우 오래됨 |

**투명도**: 경과 시간에 따라 점진적으로 투명해짐
- 0~5분: opacity 1.0
- 5~15분: opacity 0.8
- 15~30분: opacity 0.6
- 30~60분: opacity 0.4
- 60분+: opacity 0.2

```javascript
function getStrikeColor(strikeTime, now) {
    const elapsedMin = (now - new Date(strikeTime)) / 60000;

    if (elapsedMin < 5)  return { color: "#FF0000", opacity: 1.0 };
    if (elapsedMin < 10) return { color: "#FF6600", opacity: 0.8 };
    if (elapsedMin < 15) return { color: "#FFCC00", opacity: 0.8 };
    if (elapsedMin < 20) return { color: "#99CC00", opacity: 0.6 };
    if (elapsedMin < 30) return { color: "#33AA33", opacity: 0.6 };
    if (elapsedMin < 60) return { color: "#3366FF", opacity: 0.4 };
    return { color: "#999999", opacity: 0.2 };
}
```

---

### 9.5 시간 범위 컨트롤

사용자가 지도에 표시할 시간 범위를 조절:

```
[10분] [30분] [1시간] [2시간]   ← 버튼 또는 슬라이더
```

기본값: 30분. 선택한 범위 이내의 낙뢰만 지도에 표시. 요약 패널도 연동.

---

### 9.6 전체 렌더링 흐름

```javascript
function renderLightningMap(ctx, strikes, arp, timeRangeMin) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeRangeMin * 60000);

    // 1. 캔버스 클리어 (배경 이미지가 있으면 여기서 drawImage)
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#1a1a2e";  // 어두운 배경 (추후 이미지로 교체)
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 2. 동심원
    drawZoneCircles(ctx);

    // 3. ARP 마커
    drawARP(ctx);

    // 4. 시간 범위 내 낙뢰 마커
    const visible = strikes.filter(s => new Date(s.time) > cutoff);
    for (const s of visible) {
        const { x, y } = toCanvasXY(s.lat, s.lon, arp.lat, arp.lon);
        const colorInfo = getStrikeColor(s.time, now);
        drawStrike(ctx, x, y, colorInfo);
    }
}
```

#### 배경 이미지 교체 시 변경점

```javascript
// 추후 배경 이미지 추가 시:
// 1. ctx.clearRect 대신 ctx.drawImage(bgImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
// 2. 이미지의 4꼭짓점 위경도를 알면 toCanvasXY 보정 가능
// 3. 나머지 코드(동심원, 마커)는 그대로
```

---

## 9. 프론트엔드 낙뢰 병합

프론트엔드에서 시간 범위(30분 등) 표시를 위해 여러 폴링 결과를 메모리에 누적할 때, `time+lon+lat+intensity` 키로 중복 제거한다.

---

## 10. 프로젝트 반영

### 11.1 추가/수정 파일

```
백엔드:
  backend/src/parsers/lightning-parser.js       ← NEW (파싱 + Haversine + zone 분류)
  backend/src/processors/lightning-processor.js  ← NEW
  backend/src/config.js                         ← lightning 설정 추가
  backend/src/api-client.js                     ← fetchLightning 함수 추가
  backend/src/index.js                          ← cron 1줄 추가
  backend/data/lightning/                       ← 출력 디렉토리

shared:
  shared/airports.js                            ← ARP 좌표 업데이트 (사용자)
  shared/alert-defaults.js                      ← lightning_detected 트리거 추가

프론트엔드 (추후):
  frontend/src/alerts/alert-triggers.js         ← T-08 추가
  frontend/src/components/LightningMap.jsx       ← 지도 표출 컴포넌트
```

### 11.2 store.js 변경

```javascript
const cache = {
    metar:     { hash: null, prev_data: null },
    taf:       { hash: null, prev_data: null },
    warning:   { hash: null, prev_data: null },
    lightning: { hash: null, prev_data: null }   // 추가
};
```

### 11.3 체크포인트

```
CP-L1: config + api-client 수정
  ✅ fetchLightning(airport) → 텍스트 응답 반환

CP-L2: lightning-parser.js (파싱 + Haversine + zone 분류)
  ✅ 샘플 텍스트 파싱 → strikes 배열
  ✅ 각 strike에 distance_km, zone 필드 존재
  ✅ 8km 이내 → zone="alert", 16km → "danger", 32km → "caution"
  ✅ KST → UTC 변환 정확

CP-L3: lightning-processor.js
  ✅ data/lightning/latest.json 생성
  ✅ JSON에 summary.by_zone 집계 정확
  ✅ 낙뢰 없는 공항 → strikes=[], total_count=0

CP-L4: index.js cron 등록
  ✅ 3분마다 수집 로그

CP-L5: 알림 트리거 연동
  ✅ 5분 이내 + 8km 이내 낙뢰 탐지 시 severity=critical
```

---

## 11. 주의사항

1. **API 경로**: `/api/typ01/url/` — 기존 METAR/TAF(`/api/typ02/openApi/`)와 다름
2. **응답 형식**: XML이 아닌 고정폭 텍스트. fast-xml-parser 사용 불가
3. **시간대**: API tm 파라미터 = KST, 응답 TM 필드 = KST, 내부 저장 = UTC
4. **itv 양방향**: itv=5이면 tm 기준 전후 5분 = 총 10분 범위
5. **API 부하**: 8공항 × 3분 = 시간당 160회. 기상청 API 제한 확인 필요
6. **ARP 좌표**: 사용자가 AIP 기준으로 입력해야 함. 부정확한 좌표 → 거리 분류 오류
7. **Haversine 정확도**: 32km 이내에서는 구면 근사로 충분 (오차 < 0.1%)

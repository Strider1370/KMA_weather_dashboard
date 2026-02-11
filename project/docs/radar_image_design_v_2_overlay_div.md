# 레이더 강수 이미지 수집 및 표출 설계문서 (v2: DIV 오버레이 마커)

> 본 문서는 기존 설계문서(업로드: `Radar_Image_Design.md`) fileciteturn2file0를 기반으로,
> **마커 표시 방식을 B안(HTML absolute 오버레이)**로 전환하고,
> 운영 안정성(시간 계산/재시도/timeout/키 관리/동시 실행 방지)을 반영한 개정본이다.

---

## 1. 개요

### 1.1 목적

기상청 레이더 합성 강수 PNG 이미지를 5분 간격으로 수집하여, **최근 3시간(36장)**을 애니메이션으로 재생하는 시스템. 공항별 페이지에서 해당 공항 위치에 마커(✈ 또는 점)를 오버레이한다.

### 1.2 핵심 설계

- **백엔드**: 5분마다 최신 이미지 다운로드 → 파일 저장 → **36장** 순환 유지 → `latest.json` 갱신
- **프론트엔드**: 이미지 목록 fetch → 프리로드 → 순차 재생(애니메이션) → **DIV absolute 오버레이로 공항 마커 표시**
- **이미지**: 한반도 전체 PNG(고정 템플릿), 공항별 crop 없음

---

## 2. API 분석

### 2.1 엔드포인트

```
GET https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php
```

### 2.2 요청 파라미터

| 파라미터 | 의미 | 값 | 비고 |
|---------|------|---|------|
| `tm` | 기준 시각 (KST) | `YYYYMMDDHHmm` | 5분 단위 |
| `data` | 반환 형식 | `img` | img=PNG |
| `cmp` | 합성 종류 | `cmb` | 레이더 합성 강수 |
| `authKey` | 인증키 | 환경변수 | **하드코딩 금지** |

### 2.3 인증키 보안

- `.env` 또는 배포 환경변수로 주입

```
KMA_AUTH_KEY=xxxx
```

---

## 3. 수집 설계

### 3.1 폴링 전략

| 항목 | 값 | 근거 |
|------|---|------|
| 폴링 주기 | 5분 | 생산 주기와 동일 |
| 보관 장수 | **36장** | 3시간 × 12장/시간 |
| 지연 감안 | 10분(기본) | 생산/전송 지연 |
| 재시도 | 10/15/20분 전 후보 | 지연 변동 대응 |

### 3.2 다운로드할 시각 계산 (후보 tm)

**원칙**
- 내부 계산은 UTC 기준
- tm 문자열만 KST 기준으로 생성
- 최신 1개 시각 고정이 아니라 **복수 후보 시각을 순차 시도**

```javascript
function formatKstTm(dateKst) {
  const y = dateKst.getFullYear();
  const m = String(dateKst.getMonth() + 1).padStart(2, "0");
  const d = String(dateKst.getDate()).padStart(2, "0");
  const h = String(dateKst.getHours()).padStart(2, "0");
  const mi = String(dateKst.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${mi}`;
}

function getCandidateTms(delayMinutes = 10) {
  const nowUtc = new Date();
  const nowKst = new Date(nowUtc.getTime() + 9 * 3600000);

  // delay 적용
  nowKst.setMinutes(nowKst.getMinutes() - delayMinutes);

  // 5분 단위 내림
  const minute = Math.floor(nowKst.getMinutes() / 5) * 5;
  nowKst.setMinutes(minute, 0, 0);

  // 최신→과거 (10/15/20분 전)
  return [0, 1, 2].map(i => {
    const t = new Date(nowKst.getTime() - i * 5 * 60000);
    return formatKstTm(t);
  });
}
```

---

## 4. 네트워크/응답 안정성

### 4.1 fetch timeout (AbortController)

```javascript
async function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
```

### 4.2 PNG 유효성 검사

```javascript
function isValidPng(buffer) {
  return (
    buffer &&
    buffer.length > 1000 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47
  );
}
```

### 4.3 fetchRadarImage

```javascript
async function fetchRadarImage(tm) {
  const params = new URLSearchParams({
    tm,
    data: "img",
    cmp: config.radar.cmp,
    authKey: process.env.KMA_AUTH_KEY,
  });

  const url = `${config.api.radar_url}?${params}`;

  try {
    const res = await fetchWithTimeout(url, 15000);
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("image")) {
      const text = await res.text().catch(() => "");
      console.warn(`[radar] non-image response for tm=${tm}: ${text}`);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return isValidPng(buf) ? buf : null;

  } catch (e) {
    console.error(`[radar] fetch failed tm=${tm}:`, e.message);
    return null;
  }
}
```

---

## 5. 저장 구조

```
data/radar/
  ├── latest.json
  ├── RDR_YYYYMMDDHHmm.png
  └── ... (최대 36장 유지)
```

### 5.1 latest.json 구조

```json
{
  "type": "RADAR",
  "updated_at": "2026-02-11T06:30:00Z",
  "image_count": 36,
  "interval_minutes": 5,
  "images": [
    {
      "tm": "202602111420",
      "tm_utc": "2026-02-11T05:20:00Z",
      "filename": "RDR_202602111420.png",
      "path": "/data/radar/RDR_202602111420.png"
    }
  ]
}
```

---

## 6. 순환 관리 / 중복 방지

### 6.1 36장 초과 시 삭제

```javascript
function cleanupOldImages(radarDir, maxCount = 36) {
  const files = fs.readdirSync(radarDir)
    .filter(f => f.startsWith("RDR_") && f.endsWith(".png"))
    .sort();

  while (files.length > maxCount) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(radarDir, oldest));
  }
}
```

### 6.2 최신 후보 tm 중 성공본 1개 저장

```javascript
async function downloadLatestAvailable() {
  const candidates = getCandidateTms(config.radar.delay_minutes);

  for (const tm of candidates) {
    const filename = `RDR_${tm}.png`;
    const filepath = path.join(radarDir, filename);
    if (fs.existsSync(filepath)) return false;

    const buf = await fetchRadarImage(tm);
    if (buf) {
      fs.writeFileSync(filepath, buf);
      return true;
    }
  }

  return false;
}
```

---

## 7. 동시 실행 방지

```javascript
let isRunning = false;

async function processRadar() {
  if (isRunning) return;
  isRunning = true;

  try {
    const downloaded = await downloadLatestAvailable();
    if (downloaded) {
      cleanupOldImages(radarDir, config.radar.max_images);
      updateLatestJson(radarDir);
    }
  } finally {
    isRunning = false;
  }
}
```

---

## 8. 초기 Backfill (3시간)

```javascript
async function backfillImages() {
  // endTm: (delay 적용 + 5분 내림)의 최신 후보 1순위
  const endTm = getCandidateTms(config.radar.delay_minutes)[0];
  const end = parseKstTm(endTm); // KST 기준 Date 생성 함수

  for (let i = 35; i >= 0; i--) {
    const t = new Date(end.getTime() - i * 5 * 60000);
    const tm = formatKstTm(t);
    await downloadIfNew(tm);
    await sleep(300);
  }

  updateLatestJson(radarDir);
}
```

---

## 9. config.js 변경

```javascript
api: {
  radar_url: "https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php"
},

radar: {
  cmp: "cmb",
  delay_minutes: 10,
  max_images: 36,
  interval_minutes: 5,

  // 마커 기준 이미지 템플릿(픽셀 기준)
  base_width: 646,
  base_height: 631
},

schedule: {
  radar_interval: "*/5 * * * *"
}
```

---

## 10. 프론트엔드 표출 (DIV absolute 오버레이)

### 10.1 핵심 아이디어

- 레이더 이미지를 `<img>`로 표시
- 이미지 위에 `position:absolute`로 마커 요소를 올림
- 프레임이 바뀌면 **img src만 교체** → 마커는 그대로 유지
- 이미지 크기가 변하면 **좌표를 비례 스케일링**

### 10.2 공항 픽셀 좌표 (기준 646×631)

```javascript
const AIRPORT_PIXELS = {
  RKSI: { x: 285, y: 207 },
  RKSS: { x: 304, y: 200 },
  RKNY: { x: 398, y: 167 },
  RKPU: { x: 440, y: 323 },
  RKPK: { x: 419, y: 353 },
  RKJB: { x: 284, y: 367 },
  RKJY: { x: 348, y: 376 },
  RKPC: { x: 292, y: 463 }
};
```

### 10.3 레이아웃 구조

```html
<div class="radar-wrap">
  <img class="radar-img" />
  <div class="airport-marker" />
</div>
```

```css
.radar-wrap {
  position: relative;
  width: 100%;
  max-width: 646px;   /* 필요시 페이지 디자인에 맞게 */
}

.radar-img {
  width: 100%;
  height: auto;
  display: block;
}

.airport-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  font-size: 14px;
}
```

### 10.4 좌표 스케일링 + 마커 표시

- 기준 크기: `base_width=646`, `base_height=631`
- 실제 표시 크기: wrap의 `clientWidth/clientHeight` 또는 img의 실제 렌더 크기

```javascript
function setMarkerPosition(markerEl, wrapEl, airportCode) {
  const baseW = 646;
  const baseH = 631;
  const p = AIRPORT_PIXELS[airportCode];
  if (!p) return;

  // 실제 표시 크기
  const w = wrapEl.clientWidth;
  const h = wrapEl.clientHeight;

  const sx = w / baseW;
  const sy = h / baseH;

  markerEl.style.left = `${p.x * sx}px`;
  markerEl.style.top  = `${p.y * sy}px`;
}
```

### 10.5 프레임 재생 (img src 교체)

```javascript
function showFrame(imgEl, images, index) {
  imgEl.src = images[index].path;
}
```

### 10.6 공항 페이지별 동작

- URL/라우팅에서 공항코드 결정 (예: `/airport/RKSI`)
- 해당 공항코드로 마커 1개만 표시

```javascript
const airportCode = "RKSI"; // 라우터에서 주입
markerEl.textContent = "✈";
setMarkerPosition(markerEl, wrapEl, airportCode);
```

### 10.7 주의사항

- DIV 오버레이 방식은 **이미지 레이아웃이 ‘가로 100% + 세로 auto’로 비례 축소**될 때는 스케일링이 잘 동작함.
- `object-fit: contain`처럼 부모 박스와 비율이 어긋나 “레터박스(여백)”가 생기면 좌표가 밀릴 수 있음. 이 경우:
  - wrap을 이미지 비율에 맞추거나
  - img의 실제 렌더링 박스(`getBoundingClientRect`)를 기준으로 좌표를 계산해야 함.

---

## 11. 체크포인트

```
CP-R1: backend fetch 안정화
  - 후보 tm 재시도(10/15/20)
  - AbortController timeout
  - PNG 매직넘버 검증
  - authKey 환경변수

CP-R2: 36장 순환 + latest.json
  - 저장/정렬/삭제
  - 재시작 backfill 36장

CP-R3: 프론트 재생
  - latest.json fetch
  - 프리로드
  - img src 교체 애니메이션

CP-R4: 공항별 마커(B안)
  - 픽셀좌표 기반 absolute 오버레이
  - 스케일링 적용
  - 공항 페이지마다 해당 공항만 표시
```

---

## 12. 결론

- 공항 마커는 **위경도/투영 계산 없이** `AIRPORT_PIXELS`를 사용해 **DIV absolute 오버레이**로 구현 가능하다.
- 레이더 프레임 재생은 이미지 교체만으로 가능하며, 마커는 프레임과 독립적으로 유지된다.
- 운영 안정성을 위해 시간/재시도/timeout/키/동시성 방지를 반영하였다.


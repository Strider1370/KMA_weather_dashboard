# KMA Weather Dashboard

KMA 항공기상 수집기 + 대시보드 프로젝트입니다.

이 프로젝트는 KMA 항공/기상 피드(METAR, TAF, AMOS 강수, 특보, 낙뢰, 레이더, 레이더 에코, 저고도 중요기상예보 SIGWX_LOW, GK2A 안개 위성영상)와 OpenSky ADS-B 항공기 위치를 주기적으로 수집하고, 정규화된 결과를 `backend/data/`에 저장한 뒤 React 대시보드로 제공합니다.

## 프로젝트가 하는 일

- 국내 주요 공항 대상 기상 소스를 수집/정규화합니다.
- Cron 스케줄 기반으로 수집기를 실행하고, 중복 실행을 잠금으로 방지합니다.
- 카테고리별 `latest.json`과 시각별 이력 파일을 함께 관리합니다.
- 단일 Node 서버에서 API와 정적 데이터를 함께 제공합니다.
- METAR/TAF/특보/낙뢰/레이더 에코/SIGWX_LOW를 단일 인터랙티브 지도 패널과 함께 렌더링합니다.
- ADS-B `Traffic` 레이어로 한국 주변 상공 항공기 현재 위치를 지도에 표시합니다.
- GK2A `안개` 레이어로 IR105 배경 + FOG 산출물을 합성한 위성영상을 지도에 표시합니다.
- `/test` 경로에서는 `TST1` 테스트 공항을 선택할 수 있고, 메인 `/`에서는 `TST1`을 숨깁니다.

## 기술 스택

- 백엔드 런타임: Node.js
- 프론트엔드: React 18 + Vite
- 백엔드 모듈: CommonJS (`require`/`module.exports`)
- 프론트엔드 모듈: ESM (`import`/`export`)
- 저장소: 파일 기반 JSON + PNG 에셋 (`backend/data`)

## 모듈 구조 메모

- 현재 모듈 시스템은 의도적으로 혼합되어 있습니다.
- 백엔드 수집기/파서는 CommonJS를 사용합니다.
- `server.js`는 ESM으로 작성되어 있으며 `createRequire()`로 CommonJS 백엔드 모듈을 로드합니다.
- 현재 동작상 결함으로 판단되지는 않지만, 추후 모듈 시스템 정리 여부는 별도 결정 사항입니다.
- 리스크는 기능 변경 시 import/require 경계, 모듈 캐시 처리, 향후 `type: module` 전환 또는 테스트/번들 환경 변경 시 호환성 검토가 필요하다는 점입니다.

## 시스템 아키텍처

```text
KMA APIs
  ├─ typ02/openApi (METAR/TAF/WARNING XML)
  ├─ typ01/url/lgt_pnt.php (낙뢰)
  ├─ typ01/url/amo_sigwx.php (저고도 SIGWX)
  ├─ typ04/url/rdr_cmp_file.php (레이더 바이너리 / 에코 생성용)
  ├─ typ01/url/amos.php (AMOS 일강수량)
  ├─ typ05/api/GK2A/LE1B/{channel}/{region}/data (IR105 위성영상)
  └─ typ05/api/GK2A/LE2/{product}/{region}/data (FOG 안개 산출물)

OpenSky Network
  └─ states/all (ADS-B 현재 항공기 위치)
        |
        v
backend/src/processors/* (cron 수집기)
        |
        v
backend/src/parsers/* (포맷 파싱/정규화)
        |
        v
backend/src/store.js -> backend/data/<type>/*
        |
        v
server.js
  ├─ /api/*  (JSON)
  ├─ /data/* (저장된 정적 파일)
  └─ /, /test (SPA 엔트리)
        |
        v
frontend/src (React 대시보드)
```

## 프로젝트 구조

```text
.
├── backend/
│   ├── data/                         # 저장 결과물(생성 파일)
│   │   ├── metar/
│   │   ├── taf/
│   │   ├── amos/
│   │   ├── warning/
│   │   ├── lightning/
│   │   ├── adsb/
│   │   ├── radar/                    # 레이더 이미지 + echo png/meta
│   │   └── satellite/                # GK2A 위성 png/meta
│   ├── src/
│   │   ├── processors/
│   │   │   ├── metar-processor.js
│   │   │   ├── taf-processor.js
│   │   │   ├── amos-processor.js
│   │   │   ├── warning-processor.js
│   │   │   ├── sigwx-low-processor.js
│   │   │   ├── lightning-processor.js
│   │   │   ├── radar-echo-processor.js
│   │   │   └── adsb-processor.js
│   │   ├── parsers/
│   │   ├── api-client.js
│   │   ├── config.js
│   │   ├── store.js
│   │   ├── stats.js
│   │   └── index.js
│   └── test/
│       └── run-once.js
├── docs/
│   └── ads-b.md
├── frontend/
│   ├── public/geo/
│   ├── src/
│   │   ├── components/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── App.css
│   ├── package.json
│   └── vite.config.js
├── shared/
├── scripts/
├── server.js
├── package.json
├── AGENTS.md
└── map.geojson
```

## 수집 스케줄

현재 스케줄 값은 `backend/src/config.js`에 정의되어 있습니다.

- METAR: `*/10 * * * *`
- TAF: `*/30 * * * *`
- AMOS: `*/10 * * * *`
- WARNING: `*/5 * * * *`
- SIGWX_LOW: `5 5,11,17,23 * * *`
- LIGHTNING: `*/5 * * * *`
- RADAR_ECHO: `*/5 * * * *`
- ADSB: `*/5 * * * *`

`runWithLock` 실행 잠금으로 동일 타입 중복 실행을 방지합니다.

## 데이터 저장 모델

- 카테고리별 결과는 `backend/data/<type>/`에 저장됩니다.
- 각 카테고리 `latest.json`은 항상 최신으로 갱신됩니다.
- AMOS 일강수량은 `backend/data/amos/latest.json`에 별도 저장되며, METAR payload와 분리된 snapshot hash를 가집니다.
- 레이더 이미지/에코 에셋은 `backend/data/radar/`에 저장되며 `/data/radar/*`로 제공됩니다.
- ADS-B 현재 위치 스냅샷은 `backend/data/adsb/latest.json`에 저장되며 `/api/adsb`로 제공됩니다.
- SIGWX_LOW 스냅샷은 `backend/data/sigwx_low/latest.json`에 저장되며 `/api/sigwx-low`로 제공됩니다.
- GK2A 위성 스냅샷은 `backend/data/satellite/sat_meta.json`과 `sat_korea_<tm>.png`에 저장되며 `/data/satellite/*`로 제공됩니다. API 호출용 `tm`은 UTC, 저장/표시용 `tm`은 KST입니다.
- 지도 경계는 `frontend/public/geo/korea_boundaries.v1.topojson`(시도/시군구 통합)과 `frontend/public/geo/korea_neighbors_masked.v1.geojson`을 사용합니다.

예시:

- `backend/data/metar/latest.json`
- `backend/data/taf/latest.json`
- `backend/data/amos/latest.json`
- `backend/data/warning/latest.json`
- `backend/data/lightning/latest.json`
- `backend/data/adsb/latest.json`
- `backend/data/sigwx_low/latest.json`
- `backend/data/radar/echo_meta.json`
- `backend/data/radar/echo_korea_<tm>.png`
- `backend/data/satellite/sat_meta.json`
- `backend/data/satellite/sat_korea_<tm>.png`
- `frontend/public/geo/korea_boundaries.v1.topojson`

## API 표면

### JSON 엔드포인트

- `/api/metar`
- `/api/taf`
- `/api/amos`
- `/api/warning`
- `/api/lightning`
- `/api/adsb`
- `/api/sigwx-low`
- `/api/snapshot-meta`
- `/api/airports`
- `/api/warning-types`
- `/api/alert-defaults`

### 정적 데이터

- `/data/*` -> `backend/data/*`

## 사전 요구사항

- Node.js 18+ (권장: 20)
- npm 9+
- `.env`에 유효한 `API_AUTH_KEY`

## 환경 변수

프로젝트 루트에 `.env` 파일 생성:

```env
API_AUTH_KEY=your_kma_key

# Optional overrides
# PORT=5173
# DATA_PATH=backend/data
# API_BASE_URL=https://apihub.kma.go.kr/api/typ02/openApi
# LIGHTNING_API_URL=https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php
# SIGWX_LOW_API_URL=https://apihub.kma.go.kr/api/typ01/url/amo_sigwx.php
# AMOS_API_URL=https://apihub.kma.go.kr/api/typ01/url/amos.php
# RADAR_API_URL=https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php
# RADAR_CMP_TYPE=hsr
# SATELLITE_API_URL=https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B
# SATELLITE_FOG_API_URL=https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2
# ADSB_API_URL=https://opensky-network.org/api/states/all
# ADSB_LAMIN=33
# ADSB_LAMAX=39
# ADSB_LOMIN=124
# ADSB_LOMAX=132
```

## 설치

루트에서 실행:

```bash
npm install
npm --prefix frontend install
```

## 실행

### 1) 스케줄러만 실행

```bash
npm run start
```

`backend/src/index.js`를 실행합니다.

### 2) 대시보드 서버 실행(API + 정적 파일)

```bash
npm run dashboard
```

`server.js`를 실행합니다. 서버 시작 시 스케줄러 부트스트랩도 함께 실행됩니다.

주의:

- 앱 서버는 `127.0.0.1`에 바인딩됩니다.
- 외부 공개는 nginx 같은 리버스 프록시 뒤에서 운영하는 구성을 전제로 합니다.

### 3) 로컬 개발 모드(server + Vite)

```bash
npm run dev
```

## 프론트 빌드

```bash
npm --prefix frontend run build
npm --prefix frontend run preview

# Boundary build tools
npm run geo:sido
npm run geo:sigungu
npm run geo:topo
```

프론트엔드 개발 의존성으로 `@biomejs/biome`가 포함되어 있어 CSS/JS 진단에 활용할 수 있습니다.

## 테스트

전체 수집 스모크 테스트:

```bash
npm test
```

단일 타깃 테스트:

```bash
node backend/test/run-once.js metar
node backend/test/run-once.js taf
node backend/test/run-once.js amos
node backend/test/run-once.js warning
node backend/test/run-once.js sigwx-low
node backend/test/run-once.js lightning
node backend/test/run-once.js lightning-backfill
node backend/test/run-once.js radar-echo
node backend/test/run-once.js adsb
node backend/test/run-once.js satellite
```

TLS 인증서 체인 문제로 외부 API 호출이 실패하는 환경에서는 임시로 다음처럼 실행할 수 있습니다.

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm test
```

ADS-B만 단건 확인:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; node backend/test/run-once.js adsb
```

## 프론트 동작 메모

- 기본 맵 테마는 `화이트(기본)`입니다.
- METAR 카드의 강수량은 `/api/metar`에 포함된 값이 아니라 `/api/amos`에서 별도로 폴링하는 `일강수량`입니다.
- 지도 경계는 확대/축소에 따라 자동 전환됩니다 (`zoom >= 9`: 시군구, `zoom < 9`: 시도).
- 경계 데이터(`.v1.topojson`/`.v1.geojson`)는 브라우저 HTTP 캐시 + 프론트 메모리 캐시를 함께 사용해 전환 시 재요청을 최소화합니다.
- 레이더 루프는 첫 진입 시 최신 프레임에서 일시정지 상태로 시작합니다.
- 전국 레이더 에코는 `HSR` 바이너리를 사용하며, 반사도(`dBZ`)를 강수강도(`mm/h`)로 치환한 뒤 전체 레이더 도메인 기준으로 재투영한 PNG를 오버레이합니다.
- GK2A `안개` 레이어는 IR105 LE1B와 FOG LE2를 합성해 생성합니다. IR 배경은 고정 brightness-temperature stretch(`190K..310K`)를 우선 사용하고, 안개 오버레이 색은 KMA 범례(`0 Fog -> 6 Lower Cloud`)에 맞춰 보간합니다.
- Korea 모드에서는 레이더 사이트 반경 메타데이터를 union한 커버리지 경계를 점선으로 표시하고, 해당 경계 바깥 영역만 약하게 어둡게 표시합니다.
- 레이더 오버레이의 `0.1 mm/h` 미만 영역은 투명 처리되어 다크 모드에서 밝은 테두리가 보이지 않도록 조정되어 있습니다.
- 위성 레이어가 켜져 있을 때는 해안선/행정경계선이 노란색으로 바뀌고, 투명도 없이(`opacity=1`) 표시됩니다.
- 레이더 에코와 위성 레이어를 둘 다 켜면 공통 타임라인을 사용하며, 에코를 껐다 켜도 버튼이 비활성화되지 않도록 분리된 프레임 상태를 사용합니다.
- `Traffic` 레이어는 기본적으로 꺼져 있습니다.
- `SIGWX_LOW`는 지도 우상단 토글로 켜고 끌 수 있으며, 전국 모드에서는 인천 FIR 경계와 함께 표시됩니다.
- `SIGWX_LOW` 아이템은 영역(`item_type 4`)과 배지/텍스트(`item_type 7/10/12`)를 그룹화해 같은 현상으로 취급합니다.
- `Traffic` 레이어는 설정창 `항적` 탭에서 호출부호(`KAL, AAR123`) 부분일치 필터와 1만 ft 단위 고도 필터를 함께 적용할 수 있습니다. 고도 밴드는 기본적으로 5개 전체가 선택된 상태이며, 아무것도 선택하지 않으면 항적이 전혀 표시되지 않습니다. 호출부호 필터가 비어 있으면 전체 표시, 값이 입력되면 해당 문자열 포함 항적만 표시됩니다. 선택 값은 `localStorage`(`traffic_altitude_bands`, `traffic_callsign_filter`)에 저장됩니다.
- 공항을 전환하면 열려 있는 모든 알람 팝업과 마키 배너가 즉시 닫힙니다.
- 설정창 `일반` 탭의 **사이트 테마** (라이트/다크)를 변경하면 사이트 전체 색상과 지도 타일이 함께 전환됩니다. 선택값은 `localStorage` 키 `map_theme`에 저장됩니다.
- TAF 패널은 상단 토글로 `타임라인`과 `테이블`을 전환할 수 있으며, 테이블 뷰는 연속된 동일 조건을 시간 구간 단위로 병합해 축약 표시합니다.
- 낙뢰 마커는 Airport/Korea 모드 모두 전국(`nationwide`) 데이터를 표시합니다.
- Airport 모드의 8km/16km/32km 카운트는 선택 공항 기준 zone 집계를 그대로 유지합니다.
- 낙뢰 데이터는 5분 간격 전국 1회 호출 결과를 4시간 롤링 히스토리로 누적 저장하며, 지도에서는 현재 선택된 레이더/위성 프레임 시각 기준 최근 60분만 표시합니다.
- 낙뢰 토글이 켜지면 우측에 시간대 범례가 표시되고, `깜빡임` 버튼으로 낙뢰 마커 점멸 효과를 켜고 끌 수 있습니다.
- 공항 선택은 경로별로 로컬 저장됩니다.
  - `/`: 기본 공항 `RKSI`, `TST1` 숨김
  - `/test`: 기본 공항 `TST1`, `TST1` 선택 가능

## 배포 업데이트 예시

```bash
git pull --rebase origin main
npm install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart weather-app || pm2 start server.js --name weather-app
pm2 save
pm2 logs weather-app --lines 100
```

로컬 변경 때문에 pull이 막히면:

```bash
git stash push -u -m "server-local-before-update"
```

## nginx 메모

배포에서 nginx가 `frontend/dist` 정적 파일을 직접 서빙한다면 아래 두 가지를 같이 적용하는 편이 좋습니다.

1. `.geojson` / `.topojson` MIME 타입 지정
2. `gzip` 또는 `brotli` 압축 활성화

예시:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 5;
gzip_proxied any;
gzip_types
  text/plain
  text/css
  application/json
  application/javascript
  text/javascript
  application/geo+json
  application/topo+json
  image/svg+xml;

types {
  application/geo+json geojson;
  application/topo+json topojson;
}
```

`server.js`도 `.geojson` / `.topojson`에 대해 각각 `application/geo+json; charset=utf-8`, `application/topo+json; charset=utf-8`을 반환하도록 맞춰져 있습니다.

## 트러블슈팅

- KMA API 401/403: `API_AUTH_KEY`와 일일 호출량 제한 확인
- 레이더 에코 미갱신: 최신 코드 프로세스 + cron 동작 여부 확인
- 대시보드 데이터 정체: 각 `backend/data/<type>/latest.json` 갱신 여부와 서버 로그 확인
- OpenSky/기타 HTTPS 호출에서 인증서 체인 오류가 나면 테스트/로컬 확인 시 `NODE_TLS_REJECT_UNAUTHORIZED=0`를 임시 사용하고, 운영에서는 서버 CA 체인을 바로잡는 쪽을 우선합니다.
- 포트 충돌: `PORT` 환경 변수 변경 또는 기존 프로세스 종료

## 기여 가이드

- 코딩 규칙/워크플로는 `AGENTS.md`를 따르세요.
- 명시적 요청이 없으면 `backend/data/` 생성물은 커밋하지 마세요.
- 변경 범위는 기능/수집기 단위로 작게 유지하세요.

## LIFR Minima Settings

- LIFR thresholds are configurable per airport in Settings > `MINIMA`.
- Values are persisted in `localStorage` as `airport_minima_settings`.
- The configured thresholds are used by both METAR and TAF views for flight category and visibility/ceiling tint classification.

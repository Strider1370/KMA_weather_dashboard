# KMA Weather Dashboard

KMA 항공기상 수집기 + 대시보드 프로젝트입니다.

이 프로젝트는 KMA 항공/기상 피드(METAR, TAF, 특보, 낙뢰, 레이더, 레이더 에코)를 주기적으로 수집하고,
정규화된 결과를 `backend/data/`에 저장한 뒤 React 대시보드로 제공합니다.

## 프로젝트가 하는 일

- 국내 주요 공항 대상 기상 소스를 수집/정규화합니다.
- Cron 스케줄 기반으로 수집기를 실행하고, 중복 실행을 잠금으로 방지합니다.
- 카테고리별 `latest.json`과 시각별 이력 파일을 함께 관리합니다.
- 단일 Node 서버에서 API와 정적 데이터를 함께 제공합니다.
- METAR/TAF/특보/낙뢰/레이더/지도 패널을 대시보드로 렌더링합니다.

## 기술 스택

- 백엔드 런타임: Node.js
- 프론트엔드: React 18 + Vite
- 백엔드 모듈: CommonJS (`require`/`module.exports`)
- 프론트엔드 모듈: ESM (`import`/`export`)
- 저장소: 파일 기반 JSON + PNG 에셋 (`backend/data`)

## 시스템 아키텍처

```text
KMA APIs
  ├─ typ02/openApi (METAR/TAF/WARNING XML)
  ├─ typ01/url/lgt_pnt.php (낙뢰)
  ├─ typ04/url/rdr_cmp_file.php (레이더 이미지 + 레이더 바이너리)
  └─ typ01/url/amos.php (강수량)
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
  └─ /data/* (저장된 정적 파일)
        |
        v
frontend/src (React 대시보드)
```

## 프로젝트 구조 (상세)

```text
.
├── backend/
│   ├── data/                         # 저장 결과물(생성 파일)
│   │   ├── metar/
│   │   ├── taf/
│   │   ├── warning/
│   │   ├── lightning/
│   │   └── radar/                    # 레이더 이미지 + echo png/meta
│   ├── src/
│   │   ├── processors/               # 수집 파이프라인
│   │   │   ├── metar-processor.js
│   │   │   ├── taf-processor.js
│   │   │   ├── warning-processor.js
│   │   │   ├── lightning-processor.js
│   │   │   ├── radar-processor.js
│   │   │   └── radar-echo-processor.js
│   │   ├── parsers/                  # 포맷별 파서
│   │   │   ├── metar-parser.js
│   │   │   ├── taf-parser.js
│   │   │   ├── warning-parser.js
│   │   │   ├── lightning-parser.js
│   │   │   ├── radar-echo-parser.js
│   │   │   └── amos-parser.js
│   │   ├── api-client.js             # XML API fetch/retry 정책
│   │   ├── config.js                 # env + 스케줄 + 수집기 설정
│   │   ├── store.js                  # 해시 기반 저장/회전
│   │   ├── stats.js                  # 수집기 실행/실패 통계
│   │   └── index.js                  # 스케줄러 진입점
│   └── test/
│       └── run-once.js               # 1회성 수집 테스트 러너
├── docs/                             # 설계/참고 문서
├── frontend/
│   ├── src/
│   │   ├── components/               # 대시보드 컴포넌트
│   │   ├── utils/                    # api/helpers/alert 로직
│   │   ├── App.jsx                   # 메인 조합
│   │   └── App.css                   # 스타일
│   ├── package.json
│   └── vite.config.js
├── shared/                           # 공항/타입/기본값 공유 데이터
├── scripts/                          # 유틸 스크립트
├── server.js                         # API + 정적 파일 서버
├── package.json                      # 루트 명령/의존성
├── AGENTS.md                         # 에이전트 작업 가이드
└── map.geojson                       # 지도 경계 소스
```

## 수집 스케줄 매트릭스

현재 스케줄 값은 `backend/src/config.js`에 정의되어 있습니다.

- METAR: `*/10 * * * *`
- TAF: `*/30 * * * *`
- WARNING: `*/5 * * * *`
- LIGHTNING: `*/5 * * * *`
- RADAR: `*/5 * * * *`
- RADAR_ECHO: `*/5 * * * *`

`runWithLock` 실행 잠금으로 동일 타입 중복 실행을 방지합니다.

## 데이터 저장 모델

- 카테고리별 결과는 `backend/data/<type>/`에 저장됩니다.
- 각 카테고리 `latest.json`은 항상 최신으로 갱신됩니다.
- 시각별 JSON 이력은 회전 정책에 따라 유지됩니다.
- 레이더 이미지/에코 에셋은 `backend/data/radar/`에 저장되며 `/data/radar/*`로 제공됩니다.

예시:
- `backend/data/metar/latest.json`
- `backend/data/taf/latest.json`
- `backend/data/warning/latest.json`
- `backend/data/lightning/latest.json`
- `backend/data/radar/latest.json`
- `backend/data/radar/echo_meta.json`
- `backend/data/radar/echo_RKSI.png`

## API 표면 (server.js)

### JSON 엔드포인트

- `/api/metar`
- `/api/taf`
- `/api/warning`
- `/api/lightning`
- `/api/radar`
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
# AMOS_API_URL=https://apihub.kma.go.kr/api/typ01/url/amos.php
# RADAR_API_URL=https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php
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

`backend/src/index.js`를 실행합니다(수집 cron 전용).

### 2) 대시보드 서버 실행(API + 정적 파일)

```bash
npm run dashboard
```

`server.js`를 실행합니다. 서버 시작 시 스케줄러 부트스트랩도 함께 실행됩니다.

### 3) 로컬 개발 모드(server + Vite)

```bash
npm run dev
```

서버와 프론트 개발 서버를 동시에 실행합니다.

## 프론트 빌드

```bash
npm --prefix frontend run build
npm --prefix frontend run preview
```

## 테스트

전체 수집 스모크 테스트:

```bash
npm test
```

단일 타깃 테스트:

```bash
node backend/test/run-once.js metar
node backend/test/run-once.js taf
node backend/test/run-once.js warning
node backend/test/run-once.js lightning
node backend/test/run-once.js radar
```

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

## 트러블슈팅

- KMA API 401/403: `API_AUTH_KEY`와 일일 호출량 제한 확인
- 레이더 에코 미갱신: 최신 코드 프로세스 + cron 동작 여부 확인
- 대시보드 데이터 정체: 각 `backend/data/<type>/latest.json` 갱신 여부와 서버 로그 확인
- 포트 충돌: `PORT` 환경 변수 변경 또는 기존 프로세스 종료

## 기여 가이드

- 코딩 규칙/워크플로는 `AGENTS.md`를 따르세요.
- 명시적 요청이 없으면 `backend/data/` 생성물은 커밋하지 마세요.
- 변경 범위는 기능/수집기 단위로 작게 유지하세요.

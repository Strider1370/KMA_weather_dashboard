# KMA Aviation Weather Dashboard

KMA API를 사용해 공항 기상(METAR, TAF, WARNING)과 낙뢰/레이더 데이터를 수집하고, React 대시보드와 알림 시스템으로 표출하는 프로젝트입니다.

## 주요 기능
- 정기 수집: METAR, TAF, WARNING, LIGHTNING, RADAR
- 대시보드: 공항별 현재/예보/경보 + 낙뢰 지도 + 레이더 패널
- 알림: 8개 트리거 기반 팝업/사운드/마퀴
- 캐시 저장: `latest.json` + 이력 파일 회전
- 테스트 오버레이: `backend/data/TST1/*.json` 병합 지원

## 프로젝트 구조
- `backend/src/`: 수집기/파서/스토어/스케줄러
- `backend/test/run-once.js`: 스모크 실행
- `backend/data/`: 런타임 데이터 저장소
- `frontend/src/`: React UI
- `frontend/server.js`: API + 정적서빙 + 스케줄러 시작점
- `shared/`: 공항/경보타입/알림기본값 공유 설정
- `docs/`: 설계 문서

자세한 구조와 의존성은 `PROJECT_ARCHITECTURE.md`를 기준으로 확인하세요.

## 빠른 시작
```bash
npm install
npm --prefix frontend install
```

`.env` 파일 예시:
```env
API_AUTH_KEY=your_kma_api_key
API_BASE_URL=https://apihub.kma.go.kr/api/typ02/openApi
LIGHTNING_API_URL=https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php
RADAR_API_URL=https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php
DATA_PATH=./backend/data
PORT=5173
```

## 실행 명령
- `npm run dev`: API 서버(`5173`) + Vite(`5174`)
- `npm run dashboard`: 운영형 서버 실행 (`frontend/server.js`)
- `npm start`: 백엔드 스케줄러만 실행
- `npm test`: 전체 파이프라인 1회 실행
- `node backend/test/run-once.js metar` (또는 `taf|warning|lightning|radar|all`)
- `npm --prefix frontend run build`: 프론트 빌드

## 데이터 수집 주기
- METAR: `*/10 * * * *`
- TAF: `*/30 * * * *`
- WARNING: `*/5 * * * *`
- LIGHTNING: `*/3 * * * *`
- RADAR: `*/5 * * * *`

## API 엔드포인트
- `GET /api/metar`
- `GET /api/taf`
- `GET /api/warning`
- `GET /api/lightning`
- `GET /api/radar`
- `GET /api/status`
- `GET /api/airports`
- `GET /api/warning-types`
- `GET /api/alert-defaults`
- `POST /api/refresh`
- `GET /data/*` (레이더 PNG 포함 정적 접근)

## 개발 규칙 요약
- 들여쓰기 2칸, 세미콜론 사용
- 백엔드: CommonJS / 프론트엔드: ESM
- 파일명: 백엔드 kebab-case, React 컴포넌트 PascalCase
- `frontend/server.js`가 현재 실행 경로
- 인증키는 `API_AUTH_KEY` 단일 사용

기여 가이드는 `AGENTS.md`를 참고하세요.

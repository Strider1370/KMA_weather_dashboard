# KMA Aviation Weather Dashboard

> 기상청(KMA) API 기반 실시간 항공 기상 모니터링 대시보드

[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-purple)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)

## ✨ 주요 기능

- 🌤️ **실시간 기상 데이터**: METAR, TAF, 경보 자동 수집 (10분/30분/5분 간격)
- 🏢 **8개 공항 지원**: 인천, 김포, 제주, 김해, 대구, 광주, 청주, 양양
- 🚨 **스마트 알림 시스템**: 7가지 트리거 (경보 발령, 저시정, 강풍, 기상현상, 저운고, TAF 악기상)
- 🔔 **3가지 알림 방식**: 팝업, 사운드, 마퀴 (독립적 on/off)
- 📊 **실시간 모니터링**: 데이터 수집 현황, severity 기반 색상 표시
- ⚙️ **개인화 설정**: 트리거/디스패처별 설정, 쿨다운, 조용 시간

## 🚀 빠른 시작

### 1. 환경 설정

```bash
# 의존성 설치
npm install
cd frontend && npm install && cd ..

# 환경 변수 설정
cp .env.example .env
# .env 파일에 API_AUTH_KEY 입력
```

### 2. 실행

#### 개발 모드 (추천)
```bash
npm run dev
```
- API 서버: http://localhost:5173
- Vite dev: http://localhost:5174 (HMR)

#### 프로덕션 모드
```bash
cd frontend && npm run build && cd ..
npm run dashboard
```
- 서버: http://localhost:5173

## 📁 프로젝트 구조

```
project/
├── backend/          # 데이터 수집 및 처리
│   ├── src/
│   │   ├── parsers/     # METAR/TAF/WARNING 파서
│   │   ├── processors/  # API 호출 및 저장
│   │   ├── index.js     # 스케줄러
│   │   ├── config.js    # 설정
│   │   └── store.js     # 캐싱
│   └── data/            # 수집된 JSON 데이터
├── frontend/         # React + Vite 대시보드
│   ├── src/
│   │   ├── components/  # UI 컴포넌트
│   │   ├── utils/       # API, 알림 시스템
│   │   └── App.jsx      # 메인 앱
│   └── server.js        # API 서버
├── shared/           # 공유 데이터 (공항, 경보 타입, 알림 설정)
└── docs/             # 설계 문서
```

상세 구조는 [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) 참고

## 🎯 주요 명령어

```bash
# 개발 모드 (API + Vite dev)
npm run dev

# 프로덕션 서버 (빌드 필요)
npm run dashboard

# 백엔드 스케줄러만
npm start

# 수동 데이터 수집
npm test

# 프론트엔드 빌드
cd frontend && npm run build
```

## 🔔 알림 시스템

### 7개 트리거
1. **경보 발령** (T-01): 새 경보 발생 → critical
2. **경보 해제** (T-02): 경보 해제 → info
3. **저시정** (T-03): visibility < 1500m → warning/critical
4. **강풍** (T-04): speed ≥ 25kt or gust ≥ 35kt → warning/critical
5. **기상현상** (T-05): TS, SN, FZRA 등 → warning/critical
6. **저운고** (T-06): ceiling < 500ft (BKN/OVC) → warning/critical
7. **TAF 악기상** (T-07): 6시간 이내 악기상 예보 → warning

### 3가지 디스패처
- 🔔 **팝업**: 우상단 토스트 (10초 자동 닫힘)
- 🔊 **사운드**: Web Audio 비프음 (critical은 3회 반복)
- 📜 **마퀴**: 하단 스크롤 바 (warning 이상)

### 설정 방법
헤더 우상단 **⚙ 버튼** 클릭 → 설정 모달

## 📡 API 엔드포인트

| 경로 | 설명 |
|------|------|
| `GET /api/metar` | METAR 데이터 |
| `GET /api/taf` | TAF 데이터 |
| `GET /api/warning` | 경보 데이터 |
| `GET /api/status` | 데이터 수집 현황 |
| `GET /api/airports` | 공항 목록 |
| `GET /api/warning-types` | 경보 타입 매핑 |
| `GET /api/alert-defaults` | 알림 기본 설정 |
| `POST /api/refresh` | 수동 데이터 수집 |

## 🛠️ 기술 스택

- **백엔드**: Node.js, node-cron, fast-xml-parser
- **프론트엔드**: React 18, Vite 6
- **스타일**: Vanilla CSS
- **빌드**: Vite, concurrently

## 📚 문서

- [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) - 프로젝트 아키텍처 (파일 의존성, 데이터 플로우)
- [WORK_SUMMARY.md](WORK_SUMMARY.md) - 작업 이력
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - 구현 계획 (21개 체크포인트)
- [docs/Alert_System_Design.md](docs/Alert_System_Design.md) - 알림 시스템 설계
- [docs/METAR_Parsing_Algorithm.md](docs/METAR_Parsing_Algorithm.md) - METAR 파싱
- [docs/TAF_Parsing_Algorithm.md](docs/TAF_Parsing_Algorithm.md) - TAF 파싱

## ⚠️ 주의사항

- **API 키 필요**: `.env` 파일에 `API_AUTH_KEY` 설정
- **numOfRows 설정**: 경보 데이터 누락 방지를 위해 `backend/src/config.js`에서 `numOfRows: 500` 권장
- **빌드 필요**: 프로덕션 모드는 `frontend/dist/` 빌드 필요

## 🐛 트러블슈팅

### 경보 데이터 누락
```javascript
// backend/src/config.js
default_params: { pageNo: 1, numOfRows: 500, dataType: "XML" }
```

### 프로덕션 모드 실행 안됨
```bash
cd frontend && npm run build && cd ..
npm run dashboard
```

### 알림 안 나옴
1. 설정 모달 (⚙) → 알림 활성화 확인
2. 쿨다운 시간 확인 (기본 5분)
3. 브라우저 콘솔 에러 확인

## 📄 라이센스

(라이센스 명시)

---

**개발**: Claude Sonnet 4.5 & User
**최종 업데이트**: 2026-02-10

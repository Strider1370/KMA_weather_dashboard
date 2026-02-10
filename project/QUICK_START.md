# Quick Start Guide - 실무 가이드

> 새로운 개발자/AI가 5분 내 작업 시작할 수 있도록

## 🚀 첫 실행 (3분)

```bash
# 1. 의존성 설치
npm install
cd frontend && npm install && cd ..

# 2. 환경 변수 설정
# .env 파일에 API_AUTH_KEY 입력

# 3. 개발 서버 실행
npm run dev
# → http://localhost:5174 (Vite dev)
# → http://localhost:5173 (API 서버)
```

### 낙뢰 Mock 테스트 빠른 실행

기본값으로 `TST1` mock이 활성화되어 있으므로 그대로 실행하면 됩니다.

```bash
npm run dev
```

비활성화가 필요할 때만:

```powershell
$env:LIGHTNING_MOCK="0"
npm run dev
```

## ⚠️ 현재 알려진 이슈 (반드시 확인!)

### 🔴 Critical

#### 1. `numOfRows` 설정 문제
**위치**: `backend/src/config.js:16`
```javascript
// ❌ 현재 (경보 데이터 누락 발생)
default_params: { pageNo: 1, numOfRows: 10, dataType: "XML" }

// ✅ 권장
default_params: { pageNo: 1, numOfRows: 500, dataType: "XML" }
```
**영향**: 경보 데이터 누락, 특히 경보가 많을 때

#### 2. 프론트엔드 빌드 없음
**증상**: `npm run dashboard` 실행 시 404 에러
**해결**:
```bash
cd frontend && npm run build && cd ..
npm run dashboard
```

### 🟡 Warning

#### 3. KMA API 불안정
- **증상**: 간헐적 `APPLICATION_ERROR` 응답
- **해결**: 자동 재시도 (3회), 실패 시 이전 캐시 사용 (`_stale` 플래그)
- **확인**: `backend/data/*/latest.json`에서 `_stale: true` 체크

#### 4. JSON BOM 인코딩 이슈
- **증상**: Vite/PostCSS 또는 서버 JSON 파싱 오류 (`Unexpected token '﻿'`)
- **원인**: `package.json` 또는 mock JSON 파일의 UTF-8 BOM
- **해결**: BOM 없이 UTF-8로 재저장

## 📋 자주 하는 작업

### 1. 새 알림 트리거 추가

**파일**: `frontend/src/utils/alerts/alert-triggers.js`

```javascript
export const TRIGGERS = [
  // ... 기존 트리거들

  // 새 트리거 추가
  {
    id: "T-08",
    name: "새로운 트리거",
    evaluate: (current, previous, params) => {
      // current: { metar, taf, warning }
      // previous: { metar, taf, warning } 또는 null

      // 조건 체크
      if (current.metar && current.metar.observation.visibility.value < params.threshold) {
        return {
          triggered: true,
          severity: "warning", // "info" | "warning" | "critical"
          message: `시정 ${current.metar.observation.visibility.value}m 감지`
        };
      }

      return { triggered: false };
    }
  }
];
```

**설정 추가**: `shared/alert-defaults.js`
```javascript
triggers: {
  // ... 기존 트리거들
  new_trigger: {
    enabled: true,
    params: { threshold: 2000 }
  }
}
```

### 2. 새 React 컴포넌트 추가

**위치**: `frontend/src/components/MyComponent.jsx`

```jsx
import { safe } from "../utils/helpers";

export default function MyComponent({ data }) {
  if (!data) return <p>No data</p>;

  return (
    <div className="my-component">
      <h3>My Component</h3>
      <p>{safe(data.value, "N/A")}</p>
    </div>
  );
}
```

**App.jsx에 추가**:
```jsx
import MyComponent from "./components/MyComponent";

// ...
<MyComponent data={data.custom} />
```

### 3. 새 API 엔드포인트 추가

**파일**: `frontend/server.js`

```javascript
// API 핸들러 추가
if (req.url === "/api/custom") {
  try {
    const customData = {
      timestamp: new Date().toISOString(),
      value: "example"
    };
    return sendJson(res, 200, customData);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}
```

**프론트엔드에서 호출**: `frontend/src/utils/api.js`
```javascript
export async function loadCustomData() {
  return fetchJson("/api/custom");
}
```

### 4. METAR/TAF 파서 수정

**파일**: `backend/src/parsers/metar-parser.js`

```javascript
// display 필드 커스터마이징
function buildDisplay(observation, flags) {
  return {
    wind: observation.wind.raw,
    visibility: String(observation.visibility.value ?? "//"),
    clouds: flags.cavok || flags.nsc ? "NSC" : observation.clouds.map(c => c.raw).join(" "),

    // 커스텀 필드 추가
    custom_field: calculateCustomValue(observation),

    // ... 기존 필드들
  };
}
```

**주의**: `display` 필드는 UI 표시용, 실제 데이터는 `observation`에 있음

### 5. 낙뢰 테스트 데이터 수정

**파일**: `backend/data/lightning/mock/TST1.json`

- `strikes` 배열의 개수/좌표/강도를 수정하면 지도 표시/알림 테스트 시나리오를 빠르게 바꿀 수 있음.
- 현재 서버는 mock 응답 시 시간값을 재계산하여 `10분/30분/60분` 필터 테스트가 가능하게 분포시킴.

## 🔍 디버깅 팁

### 1. 알림 설정 확인
```javascript
// 브라우저 콘솔에서
localStorage.getItem('alert_settings')
```

### 2. 데이터 수집 상태 확인
```bash
# 최신 METAR 데이터 확인
cat backend/data/metar/latest.json | jq '.fetched_at'

# 캐시 파일 개수
ls -la backend/data/metar/*.json | wc -l
```

### 3. 알림 이력 확인
```javascript
// 브라우저 콘솔에서
import { getHistory } from './utils/alerts';
console.log(getHistory());
```

### 4. KMA API 직접 호출
```bash
# METAR 수동 수집
npm test

# 또는 개별 수집
node backend/test/run-once.js metar
```

### 5. React DevTools
- Chrome/Firefox 확장: React Developer Tools
- Components 탭에서 state 확인
- `App` 컴포넌트의 `data`, `activeAlerts` state 확인

### 6. 낙뢰 API 확인

```bash
# 낙뢰 mock 응답 확인
curl http://localhost:5173/api/lightning
```

## 📝 코드 패턴

### 1. Null-Safe 값 표시
```javascript
import { safe } from "./utils/helpers";

// ❌ Bad
<span>{data.value || "-"}</span>

// ✅ Good
<span>{safe(data.value, "-")}</span>
```

### 2. 시간 포맷팅
```javascript
import { formatUtc } from "./utils/helpers";

// ❌ Bad
<span>{new Date(isoString).toLocaleString()}</span>

// ✅ Good
<span>{formatUtc(isoString)}</span>
// → "2026-02-10 10:00 UTC"
```

### 3. Severity 계산
```javascript
import { getSeverityLevel } from "./utils/helpers";

const level = getSeverityLevel({
  visibility: 800,  // < 800m → "danger"
  wind: 30,         // ≥ 25kt → "danger"
  gust: 40          // ≥ 35kt → "danger"
});
// → "danger" | "warn" | "ok"
```

### 4. 에러 처리 (파서)
```javascript
// backend/src/processors/metar-processor.js
try {
  const parsed = metarParser.parse(xmlString);
  results.push({ icao, data: parsed, error: null });
} catch (error) {
  results.push({ icao, data: null, error: error.message });
  failedAirports.push(icao);
}

// 실패한 공항은 이전 캐시 사용
const merged = store.mergeWithPrevious(result, "metar", failedAirports);
```

### 5. React useEffect 패턴
```javascript
// 데이터 변경 감지
useEffect(() => {
  if (!data.metar) return; // Guard clause

  // 로직 실행
  doSomething(data.metar);

  // Cleanup (필요시)
  return () => {
    cleanup();
  };
}, [data.metar]); // 의존성 배열
```

## 🎯 다음 개발 우선순위

### Phase 7 (다음 작업)
1. **lightning_detected 조건 단순화 코드 반영** → `frontend/src/utils/alerts/alert-triggers.js`, `shared/alert-defaults.js`
2. **낙뢰 파서/프로세서 백엔드 본구현** → `backend/src/parsers/lightning-parser.js`, `backend/src/processors/lightning-processor.js`
3. **numOfRows 검토** → `backend/src/config.js`
4. **테스트 작성** → Jest + React Testing Library

### Phase 8 (향후 계획)
- [ ] 모바일 앱 (React Native)
- [ ] 이메일 알림
- [ ] 데이터 시각화 (차트)
- [ ] 관리자 대시보드

## 🛠️ 유용한 명령어

```bash
# 로그 확인 (스케줄러)
npm start 2>&1 | tee backend.log

# 특정 공항만 테스트
# (파일 수정 필요: backend/test/run-once.js)

# Git 커밋 (Co-Author 추가)
git commit -m "feat: add new trigger" -m "Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 빌드 크기 확인
cd frontend && npm run build
du -sh dist/

# 의존성 업데이트 확인
npm outdated
cd frontend && npm outdated
```

## 📚 핵심 파일 치트시트

| 작업 | 파일 | 함수/섹션 |
|------|------|----------|
| 알림 트리거 추가 | `frontend/src/utils/alerts/alert-triggers.js` | `TRIGGERS` 배열 |
| 알림 설정 변경 | `shared/alert-defaults.js` | `triggers`, `dispatchers` |
| API 엔드포인트 추가 | `frontend/server.js` | `http.createServer()` 핸들러 |
| React 컴포넌트 추가 | `frontend/src/components/*.jsx` | - |
| METAR 파서 수정 | `backend/src/parsers/metar-parser.js` | `buildDisplay()` |
| TAF 파서 수정 | `backend/src/parsers/taf-parser.js` | `formatDisplay()` |
| 스케줄 변경 | `backend/src/config.js` | `schedule` 섹션 |
| 공항 추가/수정 | `shared/airports.js` | 배열에 추가 |
| 낙뢰 mock 데이터 | `backend/data/lightning/mock/TST1.json` | `strikes` 배열 |
| 낙뢰 지도 UI | `frontend/src/components/LightningMap.jsx` | 시간필터/렌더링 |
| 낙뢰 mock API | `frontend/server.cjs` | `/api/lightning` |

## 🐛 문제 해결 체크리스트

### 알림이 안 나올 때
- [ ] 설정 모달 (⚙) → 알림 활성화 확인
- [ ] 트리거별 활성화 확인
- [ ] 쿨다운 시간 경과 (기본 5분)
- [ ] 조용 시간이 아닌지 확인
- [ ] 브라우저 콘솔 에러 확인
- [ ] `localStorage.getItem('alert_settings')` 확인

### 데이터가 안 나올 때
- [ ] 백엔드 스케줄러 실행 중인지 (`npm start` 또는 `npm run dev`)
- [ ] `.env` 파일의 `API_AUTH_KEY` 확인
- [ ] `backend/data/*/latest.json` 파일 존재 확인
- [ ] `npm test`로 수동 수집 시도
- [ ] KMA API 응답 확인 (브라우저 Network 탭)

### 빌드 에러 날 때
- [ ] `node_modules` 삭제 후 재설치
- [ ] `frontend/dist` 삭제 후 재빌드
- [ ] Node.js 버전 확인 (≥ 18 권장)
- [ ] package-lock.json 삭제 후 재설치

## 🔗 참고 문서

- [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) - 전체 구조, 의존성
- [README.md](README.md) - 프로젝트 소개, 기능
- [WORK_SUMMARY.md](WORK_SUMMARY.md) - 작업 이력
- [docs/Alert_System_Design.md](docs/Alert_System_Design.md) - 알림 시스템 설계

---

**작성**: 2026-02-10
**최종 업데이트**: 2026-02-10

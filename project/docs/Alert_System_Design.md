# 알림 시스템 설계문서

## 1. 개요

### 1.1 목적

항공기상 데이터(METAR, TAF, 경보)에서 특정 조건이 충족되면 사용자에게 시각/청각 알림을 제공하는 시스템. 트리거 조건과 알림 형태를 모두 설정 가능하며, 새로운 트리거를 쉽게 추가/제거할 수 있는 구조로 설계한다.

### 1.2 핵심 원칙

1. **트리거는 플러그인 방식**: 트리거 목록 배열에 추가/제거만으로 확장
2. **알림 형태는 독립적**: 팝업, 소리, 마퀴를 개별 on/off
3. **설정은 2계층**: 서버 기본값 + 브라우저 개인 설정 (개인이 우선)
4. **대상은 선택 공항만**: 현재 보고 있는 공항에서만 트리거 평가

---

## 2. 아키텍처

```
데이터 흐름:

  latest.json (폴링)
       │
       ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
  │ DataPoller   │────▶│ AlertEngine │────▶│ AlertDispatcher     │
  │ (주기적     │     │ (트리거     │     │ (알림 형태별 실행)  │
  │  fetch)     │     │  평가)      │     │  ├ PopupAlert       │
  └─────────────┘     └─────────────┘     │  ├ SoundAlert       │
                            │              │  ├ MarqueeAlert     │
                            ▼              │  └ (확장 가능)      │
                    ┌─────────────┐       └─────────────────────┘
                    │ AlertState  │
                    │ (중복 방지, │
                    │  이력 관리) │
                    └─────────────┘
```

### 구성 요소

| 모듈 | 역할 |
|------|------|
| **DataPoller** | latest.json을 주기적으로 fetch, 이전 데이터와 비교하여 변경분 감지 |
| **AlertEngine** | 현재 선택된 공항의 데이터에 트리거 목록을 순차 평가, 발동된 트리거 목록 반환 |
| **AlertDispatcher** | 발동된 트리거를 받아 설정에 따라 팝업/소리/마퀴 등 실행 |
| **AlertState** | 동일 알림 중복 방지, 알림 이력 관리, 재알림 간격 관리 |
| **AlertSettings** | 서버 기본값 + localStorage 개인 설정 병합, 설정 UI 연동 |

---

## 3. 트리거 시스템

### 3.1 트리거 정의 구조

모든 트리거는 동일한 인터페이스를 따른다:

```javascript
{
    id: "wind_speed_high",          // 고유 ID
    name: "강풍 알림",              // 표시 이름
    description: "풍속이 임계값을 초과할 때",
    category: "metar",              // 데이터 소스: "metar" | "taf" | "warning"
    severity: "warning",            // "info" | "warning" | "critical"
    enabled: true,                  // 기본 활성화 여부
    
    // 설정 가능한 파라미터
    params: {
        threshold: { type: "number", default: 25, unit: "kt", label: "풍속 임계값" }
    },
    
    // 평가 함수: 데이터 + 이전 데이터 + 파라미터 → 결과 또는 null
    evaluate: function(current, previous, params) {
        // null 반환 = 조건 미충족
        // 객체 반환 = 트리거 발동
    }
}
```

### 3.2 트리거 목록

#### 3.2.1 경보 트리거

```javascript
// T-01: 경보 발령
{
    id: "warning_issued",
    name: "공항경보 발령",
    category: "warning",
    severity: "critical",
    params: {
        types: {
            type: "multi_select",
            default: ["00","1","2","3","4","5","7","8","13"],  // 전체
            options: WARNING_TYPES,                             // shared/warning-types.js
            label: "감시할 경보 유형"
        }
    },
    evaluate(current, previous, params) {
        // current.warnings에 있고 previous.warnings에 없는 경보 찾기
        const newWarnings = findNewWarnings(current, previous);
        const filtered = newWarnings.filter(w => params.types.includes(w.wrng_type));
        if (filtered.length === 0) return null;
        return {
            triggerId: "warning_issued",
            severity: "critical",
            title: `경보 발령: ${filtered.map(w => w.wrng_type_name).join(", ")}`,
            message: filtered.map(w => 
                `${w.wrng_type_name} (${formatTime(w.valid_start)} ~ ${formatTime(w.valid_end)})`
            ).join("\n"),
            data: filtered
        };
    }
}

// T-02: 경보 해제
{
    id: "warning_cleared",
    name: "공항경보 해제",
    category: "warning",
    severity: "info",
    params: {
        types: { type: "multi_select", default: ["00","1","2","3","4","5","7","8","13"], ... }
    },
    evaluate(current, previous, params) {
        // previous에 있고 current에 없는 경보
        const cleared = findClearedWarnings(current, previous);
        const filtered = cleared.filter(w => params.types.includes(w.wrng_type));
        if (filtered.length === 0) return null;
        return {
            triggerId: "warning_cleared",
            severity: "info",
            title: `경보 해제: ${filtered.map(w => w.wrng_type_name).join(", ")}`,
            message: "경보가 해제되었습니다.",
            data: filtered
        };
    }
}
```

#### 3.2.2 METAR 트리거

```javascript
// T-03: 저시정
{
    id: "low_visibility",
    name: "저시정 알림",
    category: "metar",
    severity: "warning",
    params: {
        threshold: { type: "number", default: 1500, unit: "m", label: "시정 임계값" }
    },
    evaluate(current, previous, params) {
        const vis = current.observation.visibility.value;
        if (vis >= params.threshold) return null;
        return {
            triggerId: "low_visibility",
            severity: vis < 500 ? "critical" : "warning",
            title: `저시정: ${vis}m`,
            message: `현재 시정이 ${vis}m으로 임계값(${params.threshold}m) 이하입니다.`,
            data: { value: vis, threshold: params.threshold }
        };
    }
}

// T-04: 강풍
{
    id: "high_wind",
    name: "강풍 알림",
    category: "metar",
    severity: "warning",
    params: {
        speed_threshold: { type: "number", default: 25, unit: "kt", label: "풍속 임계값" },
        gust_threshold:  { type: "number", default: 35, unit: "kt", label: "돌풍 임계값" }
    },
    evaluate(current, previous, params) {
        const wind = current.observation.wind;
        const exceeded = [];
        if (wind.speed >= params.speed_threshold)
            exceeded.push(`풍속 ${wind.speed}kt`);
        if (wind.gust && wind.gust >= params.gust_threshold)
            exceeded.push(`돌풍 ${wind.gust}kt`);
        if (exceeded.length === 0) return null;
        return {
            triggerId: "high_wind",
            severity: (wind.gust && wind.gust >= 50) ? "critical" : "warning",
            title: `강풍: ${exceeded.join(", ")}`,
            message: `${wind.raw} — 임계값 초과`,
            data: { speed: wind.speed, gust: wind.gust }
        };
    }
}

// T-05: 특정 기상현상 발생
{
    id: "weather_phenomenon",
    name: "기상현상 알림",
    category: "metar",
    severity: "warning",
    params: {
        phenomena: {
            type: "multi_select",
            default: ["TS", "SN", "FZRA", "FZFG", "SS", "DS"],
            options: {
                "TS": "뇌우",
                "SN": "눈",
                "FZRA": "어는비",
                "FZFG": "어는안개",
                "GR": "우박",
                "SS": "모래폭풍",
                "DS": "먼지폭풍",
                "FC": "토네이도/용오름",
                "SQ": "스콜"
            },
            label: "감시할 기상현상"
        }
    },
    evaluate(current, previous, params) {
        const wxList = current.observation.weather;
        if (!wxList || wxList.length === 0) return null;

        const matched = [];
        for (const wx of wxList) {
            // 기술자+현상 조합 확인 (예: FZRA = FZ+RA)
            const combo = (wx.descriptor || "") + wx.phenomena.join("");
            for (const target of params.phenomena) {
                if (combo.includes(target) || wx.phenomena.includes(target) || wx.descriptor === target) {
                    matched.push({ code: wx.raw, target });
                }
            }
        }
        if (matched.length === 0) return null;

        const hasTSorFC = matched.some(m => m.target === "TS" || m.target === "FC");
        return {
            triggerId: "weather_phenomenon",
            severity: hasTSorFC ? "critical" : "warning",
            title: `기상현상: ${matched.map(m => m.code).join(", ")}`,
            message: `관측된 기상현상: ${wxList.map(w => w.raw).join(" ")}`,
            data: matched
        };
    }
}

// T-06: 운저고도 저하
{
    id: "low_ceiling",
    name: "운저고도 알림",
    category: "metar",
    severity: "warning",
    params: {
        threshold: { type: "number", default: 500, unit: "ft", label: "운저고도 임계값" },
        amounts: {
            type: "multi_select",
            default: ["BKN", "OVC"],
            options: { "BKN": "BKN(5~7할)", "OVC": "OVC(8할)" },
            label: "대상 운량"
        }
    },
    evaluate(current, previous, params) {
        const clouds = current.observation.clouds;
        if (!clouds || clouds.length === 0) return null;

        const ceiling = clouds.find(c => params.amounts.includes(c.amount));
        if (!ceiling || ceiling.base >= params.threshold) return null;

        return {
            triggerId: "low_ceiling",
            severity: ceiling.base < 200 ? "critical" : "warning",
            title: `저운고: ${ceiling.amount}${formatCloudBase(ceiling.base)} (${ceiling.base}ft)`,
            message: `운저고도 ${ceiling.base}ft — 임계값(${params.threshold}ft) 이하`,
            data: { amount: ceiling.amount, base: ceiling.base }
        };
    }
}
```

#### 3.2.3 TAF 트리거

```javascript
// T-07: TAF에서 악기상 예보
{
    id: "taf_adverse_weather",
    name: "악기상 예보 알림",
    category: "taf",
    severity: "warning",
    params: {
        lookahead_hours: { type: "number", default: 6, unit: "시간", label: "예보 감시 범위" },
        vis_threshold: { type: "number", default: 3000, unit: "m", label: "시정 임계값" },
        phenomena: {
            type: "multi_select",
            default: ["TS", "SN", "FZRA"],
            options: { "TS": "뇌우", "SN": "눈", "FZRA": "어는비", "FZFG": "어는안개" },
            label: "감시할 기상현상"
        }
    },
    evaluate(current, previous, params) {
        const now = new Date();
        const limit = new Date(now.getTime() + params.lookahead_hours * 3600000);
        const alerts = [];

        for (const slot of current.timeline) {
            const slotTime = new Date(slot.time);
            if (slotTime < now || slotTime > limit) continue;

            // 시정 확인
            if (slot.visibility.value < params.vis_threshold) {
                alerts.push({
                    time: slot.time,
                    type: "vis",
                    detail: `시정 ${slot.visibility.value}m`
                });
            }

            // 기상현상 확인
            for (const wx of (slot.weather || [])) {
                const combo = (wx.descriptor || "") + wx.phenomena.join("");
                if (params.phenomena.some(p => combo.includes(p))) {
                    alerts.push({
                        time: slot.time,
                        type: "wx",
                        detail: wx.raw
                    });
                }
            }
        }

        if (alerts.length === 0) return null;
        return {
            triggerId: "taf_adverse_weather",
            severity: alerts.some(a => a.detail.includes("TS")) ? "critical" : "warning",
            title: `악기상 예보 (${params.lookahead_hours}시간 내)`,
            message: alerts.map(a => `${formatTime(a.time)}: ${a.detail}`).join("\n"),
            data: alerts
        };
    }
}
```

### 3.3 트리거 등록 방식

모든 트리거는 배열에 등록한다. 추가/제거가 이 배열 수정만으로 가능하다.

```javascript
// alert-triggers.js
const triggers = [
    warningIssued,      // T-01
    warningCleared,     // T-02
    lowVisibility,      // T-03
    highWind,           // T-04
    weatherPhenomenon,  // T-05
    lowCeiling,         // T-06
    tafAdverseWeather   // T-07
];

module.exports = triggers;
```

**새 트리거 추가 시**: 같은 인터페이스로 객체 만들고 배열에 push하면 끝.

**트리거 제거 시**: 배열에서 빼면 끝. 다른 코드 수정 불필요.

---

## 4. 알림 형태 (Dispatcher)

### 4.1 팝업 알림 (PopupAlert)

```
동작:
  - 화면 우상단에 알림 카드 표시
  - severity별 색상: critical=빨강, warning=주황, info=파랑
  - 자동 닫힘 (시간 설정 가능, 기본 10초)
  - critical은 수동 닫기만 가능 (자동 닫힘 없음)
  - 최대 동시 표시 수 설정 가능 (기본 5개, 초과 시 오래된 것부터 큐잉)

표시 내용:
  ┌──────────────────────────────┐
  │ ⚠️  강풍: 풍속 32kt, 돌풍 45kt │
  │ 33032G45KT — 임계값 초과        │
  │ RKSI 인천공항 · 14:30 KST       │
  │                        [닫기]  │
  └──────────────────────────────┘

설정 항목:
  - enabled: Boolean (기본 true)
  - auto_dismiss_seconds: Number (기본 10, 0=수동만)
  - max_visible: Number (기본 5)
  - position: "top-right" | "top-left" | "bottom-right" (기본 "top-right")
```

### 4.2 소리 알림 (SoundAlert)

```
동작:
  - severity별 다른 소리 파일 재생
  - critical: 긴급 알람 (반복 가능)
  - warning: 경고음
  - info: 알림음
  - 브라우저 오디오 API 사용 (첫 상호작용 후 활성화)

설정 항목:
  - enabled: Boolean (기본 true)
  - volume: Number 0~100 (기본 70)
  - repeat_count: Number (기본 1, critical은 기본 3)
  - sound_map: {
      critical: "alert-critical.mp3",
      warning: "alert-warning.mp3",
      info: "alert-info.mp3"
    }
```

### 4.3 마퀴 알림 (MarqueeAlert)

```
동작:
  - 화면 상단에 가로 스크롤 문구 표시 (뉴스 티커 방식)
  - 경보 발령 등 중요 알림만 표시 (severity 필터 가능)
  - 여러 알림이 큐에 쌓여 순차 스크롤
  - 배경색: severity별 (critical=빨강, warning=주황)

표시 예:
  ▶ [뇌우경보] RKSI 인천공항 — 뇌우경보 발효 중 (03:00~06:00 KST)  ◀

설정 항목:
  - enabled: Boolean (기본 true)
  - min_severity: "info" | "warning" | "critical" (기본 "warning")
  - speed: "slow" | "normal" | "fast" (기본 "normal")
  - show_duration_seconds: Number (기본 30, 0=무한)
```

### 4.4 알림 형태 확장

새 알림 형태 추가 시 AlertDispatcher에 등록만 하면 된다:

```javascript
// 예: 브라우저 Notification API
class BrowserNotification {
    show(alertResult) { ... }
}
dispatcher.register("browser_notification", new BrowserNotification());
```

---

## 5. 설정 시스템

### 5.1 2계층 구조

```
서버 기본값 (shared/alert-defaults.js)
    ↓ 병합
브라우저 개인 설정 (localStorage)
    ↓ 결과
최종 적용 설정
```

**규칙**: 개인 설정이 존재하면 개인 설정 우선. 없으면 서버 기본값 사용.

### 5.2 서버 기본값

```javascript
// shared/alert-defaults.js
module.exports = {
    // 전역 설정
    global: {
        alerts_enabled: true,           // 알림 마스터 스위치
        poll_interval_seconds: 30,      // 데이터 폴링 주기
        cooldown_seconds: 300,          // 동일 트리거 재알림 간격 (5분)
        quiet_hours: null               // 예: { start: "22:00", end: "06:00" } 또는 null
    },

    // 알림 형태별 설정
    dispatchers: {
        popup: {
            enabled: true,
            auto_dismiss_seconds: 10,
            max_visible: 5,
            position: "top-right"
        },
        sound: {
            enabled: true,
            volume: 70,
            repeat_count: { info: 1, warning: 1, critical: 3 }
        },
        marquee: {
            enabled: true,
            min_severity: "warning",
            speed: "normal",
            show_duration_seconds: 30
        }
    },

    // 트리거별 설정
    triggers: {
        warning_issued: {
            enabled: true,
            params: { types: ["00","1","2","3","4","5","7","8","13"] }
        },
        warning_cleared: {
            enabled: true,
            params: { types: ["00","1","2","3","4","5","7","8","13"] }
        },
        low_visibility: {
            enabled: true,
            params: { threshold: 1500 }
        },
        high_wind: {
            enabled: true,
            params: { speed_threshold: 25, gust_threshold: 35 }
        },
        weather_phenomenon: {
            enabled: true,
            params: { phenomena: ["TS","SN","FZRA","FZFG","SS","DS"] }
        },
        low_ceiling: {
            enabled: true,
            params: { threshold: 500, amounts: ["BKN","OVC"] }
        },
        taf_adverse_weather: {
            enabled: true,
            params: { lookahead_hours: 6, vis_threshold: 3000, phenomena: ["TS","SN","FZRA"] }
        }
    }
};
```

### 5.3 개인 설정 (localStorage)

```javascript
// 키: "aviation-weather-alert-settings"
// 값: 변경한 항목만 저장 (기본값과 다른 것만)
{
    "global": {
        "quiet_hours": { "start": "23:00", "end": "05:00" }
    },
    "dispatchers": {
        "sound": { "volume": 50 }
    },
    "triggers": {
        "low_visibility": { "params": { "threshold": 1000 } },
        "weather_phenomenon": { "enabled": false }
    }
}
```

### 5.4 설정 병합 함수

```javascript
function resolveSettings() {
    const defaults = require("shared/alert-defaults");
    const personal = JSON.parse(localStorage.getItem("aviation-weather-alert-settings")) || {};
    return deepMerge(defaults, personal);  // personal이 우선
}
```

### 5.5 설정 UI 연동

프론트엔드 설정 화면에서 변경 시:

```
1. 사용자가 설정 변경
2. 기본값과 다른 항목만 추출
3. localStorage에 저장
4. AlertEngine에 설정 반영 (핫 리로드, 재시작 불필요)
```

---

## 6. 중복 방지 및 재알림

### 6.1 AlertState

```javascript
const alertHistory = {
    // 키: "triggerId:공항ICAO:고유식별값"
    // 값: { firstFired, lastFired, count, dismissed }
    "warning_issued:RKSI:뇌우경보:0300-0600": {
        firstFired: "2026-02-08T03:05:00Z",
        lastFired: "2026-02-08T03:05:00Z",
        count: 1,
        dismissed: false
    }
};
```

### 6.2 중복 판단 규칙

```
1. 트리거 발동 시 고유 키 생성:
   - 경보: "warning_issued:{icao}:{wrng_type_name}:{valid_start}-{valid_end}"
   - METAR: "low_visibility:{icao}:{threshold}"
   - TAF: "taf_adverse_weather:{icao}:{lookahead_hours}"

2. 같은 키가 alertHistory에 존재하면:
   - lastFired 이후 cooldown_seconds가 지나지 않았으면 → 무시
   - cooldown이 지났으면 → 재알림 (count 증가)

3. 키가 없으면 → 새 알림

4. 조건이 해소되면 (예: 시정 회복) → alertHistory에서 삭제
```

### 6.3 쿨다운 예시

```
설정: cooldown_seconds = 300 (5분)

03:05  시정 800m → 알림 발동 ✅
03:06  시정 700m → 쿨다운 중 → 무시 ❌
03:10  시정 900m → 쿨다운 중 → 무시 ❌  (여전히 임계값 이하)
03:11  시정 800m → 쿨다운 지남 → 재알림 ✅
03:15  시정 2000m → 임계값 초과 → alertHistory에서 삭제
03:20  시정 1200m → 새 알림 ✅ (이전 기록 삭제되었으므로)
```

---

## 7. 실행 흐름

### 7.1 데이터 폴링 사이클

```
1. DataPoller: latest.json fetch (poll_interval_seconds 마다)
2. 이전 데이터와 비교: 변경 없으면 → 종료
3. 변경 있으면:
   a. 현재 선택된 공항의 데이터 추출
   b. AlertEngine.evaluate(currentData, previousData, settings) 호출
   c. 발동된 트리거 목록 반환

4. 각 발동 트리거에 대해:
   a. AlertState에서 중복 확인
   b. 쿨다운 확인
   c. 통과하면 → AlertDispatcher에 전달

5. AlertDispatcher:
   a. global.alerts_enabled 확인
   b. quiet_hours 확인
   c. 각 형태(popup, sound, marquee)별:
      - 해당 형태 enabled 확인
      - severity 필터 확인
      - 표시
```

### 7.2 의사 코드

```javascript
// 프론트엔드 메인 루프
setInterval(async () => {
    const settings = resolveSettings();
    if (!settings.global.alerts_enabled) return;
    if (isQuietHours(settings.global.quiet_hours)) return;

    const selectedAirport = getCurrentAirport();  // 현재 선택 공항 ICAO

    // 데이터 종류별 fetch + 평가
    for (const type of ["metar", "taf", "warning"]) {
        const current = await fetchLatest(type, selectedAirport);
        const previous = getPreviousData(type, selectedAirport);
        
        if (!hasChanged(current, previous)) continue;

        // 해당 카테고리의 트리거만 평가
        const categoryTriggers = triggers.filter(t => t.category === type);
        
        for (const trigger of categoryTriggers) {
            const triggerSettings = settings.triggers[trigger.id];
            if (!triggerSettings.enabled) continue;

            const result = trigger.evaluate(current, previous, triggerSettings.params);
            if (!result) continue;

            // 중복/쿨다운 확인
            const alertKey = buildAlertKey(result, selectedAirport);
            if (isInCooldown(alertKey, settings.global.cooldown_seconds)) continue;

            // 알림 발행
            recordAlert(alertKey);
            dispatch(result, settings.dispatchers, selectedAirport);
        }

        savePreviousData(type, selectedAirport, current);
    }
}, settings.global.poll_interval_seconds * 1000);
```

---

## 8. severity 체계

| severity | 의미 | 팝업 색상 | 소리 | 마퀴 | 자동 닫힘 |
|----------|------|----------|------|------|----------|
| `critical` | 즉각 조치 필요 | 빨강 #FF4444 | 긴급 (반복) | ✅ 표시 | ❌ 수동 닫기 |
| `warning` | 주의 필요 | 주황 #FF8800 | 경고 (1회) | ✅ 표시 | ✅ 10초 |
| `info` | 참고 | 파랑 #2196F3 | 알림 (1회) | ❌ 미표시 | ✅ 5초 |

### severity 자동 승격 규칙

일부 트리거는 값에 따라 severity가 자동 조정된다:

```
시정:   < 1500m → warning,  < 500m → critical
풍속:   ≥ 25kt → warning,   돌풍 ≥ 50kt → critical
운저고도: < 500ft → warning,  < 200ft → critical
기상현상: TS, FC → critical,  나머지 → warning
경보:   항상 critical
```

---

## 9. 프로젝트 반영

### 9.1 추가되는 파일

```
shared/
  └── alert-defaults.js              ← 서버 기본값 (NEW)

frontend/src/alerts/                  ← 프론트엔드 알림 모듈 (추후)
  ├── alert-triggers.js              ← 트리거 목록 (T-01 ~ T-07)
  ├── alert-engine.js                ← 트리거 평가
  ├── alert-state.js                 ← 중복 방지 + 이력
  ├── alert-dispatcher.js            ← 알림 형태별 실행
  ├── dispatchers/
  │   ├── popup-alert.js
  │   ├── sound-alert.js
  │   └── marquee-alert.js
  └── alert-settings.js              ← 설정 병합 + localStorage
```

### 9.2 IMPLEMENTATION_PLAN 반영

#### Phase 5: 알림 로직 테스트 (UI 최소한 — 지금 단계)

목표: 트리거 평가, 중복 방지, 설정 병합이 정상 동작하는지 확인.
UI는 console.log + 브라우저 기본 alert() + 간단한 div로만 확인.

```
CP-12: shared/alert-defaults.js + 기반
  작업:
    - shared/alert-defaults.js 생성 (5.2절 기본값)
    - 기존 프론트엔드에 alerts/ 폴더 생성
  검증:
    ✅ node -e "console.log(require('./shared/alert-defaults'))" → 설정 출력

CP-13: alert-triggers.js + alert-engine.js (핵심 로직)
  작업:
    - alert-triggers.js: T-01 ~ T-07 트리거 정의 (3절 그대로)
    - alert-engine.js: 트리거 목록을 순회하며 evaluate 호출
  검증 (실제 data/latest.json으로 테스트):
    ✅ 테스트 스크립트에서 engine.evaluate(metarData, null, settings) 호출
    ✅ 바람 25kt 이상 공항 → high_wind 트리거 발동 확인
    ✅ 경보 존재 시 → warning_issued 트리거 발동 확인
    ✅ 조건 미충족 시 → null 반환 확인
    ✅ console.log로 발동된 트리거 목록 출력

CP-14: alert-state.js (중복 방지)
  작업:
    - alertHistory 관리
    - 쿨다운 판단 (6절)
    - 조건 해소 시 이력 삭제
  검증:
    ✅ 같은 트리거 2회 연속 → 두 번째는 쿨다운으로 무시
    ✅ cooldown_seconds 경과 후 → 재알림
    ✅ 조건 해소 → 이력 삭제 → 다음 발동 시 새 알림

CP-15: alert-dispatcher.js (테스트용 최소 출력)
  작업:
    - 테스트용 dispatcher: console.log + 브라우저 alert()만 구현
    - severity별 다른 메시지 포맷
    - 설정의 enabled 플래그 반영
  검증:
    ✅ critical 트리거 → console에 "[CRITICAL] 경보 발령: 뇌우경보" 출력
    ✅ dispatcher.popup.enabled = false → 팝업 안 뜸
    ✅ 브라우저에서 실제 alert() 팝업으로 트리거 내용 확인

CP-16: alert-settings.js (설정 병합)
  작업:
    - resolveSettings(): 서버 기본값 + localStorage 병합
    - 간단한 테스트 UI: 임계값 변경 input + 저장 버튼
  검증:
    ✅ 기본값으로 동작 확인
    ✅ localStorage에 { triggers: { low_visibility: { params: { threshold: 500 } } } } 저장
    ✅ 다음 폴링 시 변경된 임계값으로 트리거 평가
    ✅ localStorage 삭제 → 기본값으로 복원

CP-17: 통합 테스트 (폴링 + 트리거 + 중복방지 + 출력)
  작업:
    - DataPoller: latest.json을 poll_interval_seconds마다 fetch
    - 이전 데이터 비교 → 변경 시 engine 호출 → state 확인 → dispatch
  검증:
    ✅ 프론트엔드 실행 상태에서 backend가 새 데이터 저장
    ✅ 폴링이 변경 감지 → 트리거 평가 → console에 알림 출력
    ✅ 동일 조건 유지 시 → 쿨다운 내 재알림 없음
    ✅ 공항 전환 시 → 새 공항 기준으로 트리거 재평가
```

#### Phase 6: 알림 UI 본 구현 (프론트엔드 디자인 단계에서)

Phase 5의 로직은 그대로 유지하고, dispatcher만 교체한다.

```
CP-18: 팝업 알림 컴포넌트
  - 테스트용 alert() → React 팝업 컴포넌트로 교체
  - severity별 색상, 자동 닫힘, 큐잉
  - 4.1절 스펙 적용

CP-19: 소리 알림
  - 오디오 파일 준비 (critical, warning, info)
  - Web Audio API로 재생
  - 볼륨, 반복 횟수 설정 반영
  - 4.2절 스펙 적용

CP-20: 마퀴 알림
  - 상단 스크롤 문구 컴포넌트
  - severity 필터, 속도, 큐잉
  - 4.3절 스펙 적용

CP-21: 설정 UI
  - 10절의 설정 화면 구현
  - localStorage 저장/불러오기
  - 기본값 복원 버튼
```

---

## 10. 설정 UI 구성

프론트엔드 설정 화면에서 제공해야 하는 항목:

```
[알림 설정]

☑ 알림 사용                          ← global.alerts_enabled
  야간 모드: 23:00 ~ 05:00 무음      ← global.quiet_hours
  재알림 간격: [5]분                   ← global.cooldown_seconds

[알림 방식]
  ☑ 팝업 알림                        ← dispatchers.popup.enabled
    자동 닫힘: [10]초
    위치: [우상단 ▼]
  ☑ 알림 소리                        ← dispatchers.sound.enabled
    볼륨: ■■■■■■■□□□ 70%
  ☑ 상단 문구                        ← dispatchers.marquee.enabled
    최소 등급: [경고 ▼]
    속도: [보통 ▼]

[감시 조건]
  ☑ 공항경보 발령                     ← triggers.warning_issued
    대상: ☑전체  ☐급변풍  ☐저시정 ...
  ☑ 공항경보 해제                     ← triggers.warning_cleared
  ☑ 저시정 알림                       ← triggers.low_visibility
    임계값: [1500]m
  ☑ 강풍 알림                         ← triggers.high_wind
    풍속: [25]kt  돌풍: [35]kt
  ☑ 기상현상 알림                     ← triggers.weather_phenomenon
    대상: ☑뇌우  ☑눈  ☑어는비 ...
  ☑ 운저고도 알림                     ← triggers.low_ceiling
    임계값: [500]ft
  ☑ 악기상 예보 알림                  ← triggers.taf_adverse_weather
    예보 범위: [6]시간

                      [기본값 복원]  [저장]
```

# 알림 시스템 설계문서

## 1. 개요

### 1.1 목적
현재 선택 공항의 METAR/TAF/WARNING/LIGHTNING 데이터를 평가해 이벤트성 알림을 생성하고, 팝업/사운드/마퀴 UI로 전달한다.

### 1.2 실제 구현 기준 파일
- `frontend/src/utils/alerts/alert-triggers.js`: 트리거 정의(T-01 ~ T-08)
- `frontend/src/utils/alerts/alert-engine.js`: 트리거 순회 평가
- `frontend/src/utils/alerts/alert-state.js`: 쿨다운/이력/해소 처리
- `frontend/src/utils/alerts/alert-dispatcher.js`: 콘솔 출력 + React 콜백 전달
- `frontend/src/utils/alerts/alert-settings.js`: 기본값 + localStorage 병합
- `frontend/src/components/alerts/*.jsx`: 팝업/사운드/마퀴/설정 UI
- `shared/alert-defaults.js`: 서버 기본 설정

---

## 2. 데이터 흐름

1. `App.jsx`가 `/api/alert-defaults`와 대시보드 데이터를 로드
2. `resolveSettings(defaults)`로 사용자 오버라이드(localStorage) 병합
3. 선택 공항 기준 `currentData` / `previousData` 구성
4. `evaluate(currentData, previousData, settings)` 호출
5. 결과별 `buildAlertKey` 생성 후 `isInCooldown` 검사
6. 통과한 결과는 `recordAlert` 후 `dispatch`
7. 이번 사이클에서 미발동 키는 `clearResolvedAlerts`로 제거

---

## 3. 트리거 정의

## 3.1 공통 인터페이스
각 트리거는 다음 구조를 따른다.

```js
{
  id: "low_visibility",
  name: "저시정 알림",
  category: "metar", // metar | taf | warning | lightning
  severity: "warning",
  evaluate(current, previous, params) { ... } // null 또는 결과 객체
}
```

결과 객체 공통 필드:
- `triggerId`
- `severity` (`critical|warning|info`)
- `title`
- `message`
- `data`

### 3.2 구현된 트리거 목록

| ID | 카테고리 | 설명 |
|---|---|---|
| `warning_issued` | warning | 이전 대비 신규 경보 |
| `warning_cleared` | warning | 이전 대비 해제 경보 |
| `low_visibility` | metar | 시정 임계값 미만 |
| `high_wind` | metar | 풍속/돌풍 임계값 초과 |
| `weather_phenomenon` | metar | 지정 기상현상 감지 |
| `low_ceiling` | metar | 운저고도 임계값 미만 |
| `taf_adverse_weather` | taf | 지정 시간 내 악기상 예보 |
| `lightning_detected` | lightning | 신규 낙뢰 감지 |

### 3.3 중요 세부 규칙
- `taf_adverse_weather`: 현재 시각부터 `lookahead_hours` 내 타임라인 슬롯만 검사
- `lightning_detected`: 이전 데이터 대비 신규 strike만 알림 대상으로 계산
- 심각도:
  - 저시정: `<500m`면 `critical`
  - 강풍: gust `>=50kt`면 `critical`
  - 낙뢰: alert zone 포함 시 `critical`, danger만 있으면 `warning`, 나머지 `info`

---

## 4. 엔진 및 상태 관리

### 4.1 엔진(`alert-engine.js`)
- 트리거를 순회하면서 `settings.triggers[trigger.id].enabled` 확인
- `category`별로 현재/이전 데이터를 선택
- `evaluate` 예외는 경고 로그 후 다음 트리거 계속 진행

### 4.2 키 생성(`alert-state.js`)
트리거별 고유키 전략:
- 경보 발령/해제: `wrng_type_name + valid_start/end` 조합
- 저시정: `threshold` 포함
- 기상현상: 매칭된 코드 목록 포함
- 낙뢰: 가장 최신 신규 strike 시각 포함

### 4.3 쿨다운/해소
- `isInCooldown(key, cooldownSeconds)`로 재알림 제한
- 발동 시 `recordAlert(key)` 기록
- 이번 평가에서 발동되지 않은 키는 `clearResolvedAlerts`로 제거

---

## 5. 디스패치 및 UI

### 5.1 디스패치(`alert-dispatcher.js`)
- 항상 콘솔 로그 출력
- 등록된 React 콜백(`setAlertCallback`)이 있으면 알림 객체 전달
- 전달 객체 예:
  - `id`, `severity`, `title`, `message`, `icao`, `triggerId`, `timestamp`

### 5.2 표시 컴포넌트
- `AlertPopup.jsx`
  - `settings.popup.max_visible`
  - `settings.popup.auto_dismiss_seconds`
- `AlertSound.jsx`
  - WebAudio beep 기반
  - `settings.sound.volume`, `settings.sound.repeat_count`
- `AlertMarquee.jsx`
  - 최소 severity 필터(`min_severity`)
  - 속도(`speed`) + 자동 숨김(`show_duration_seconds`)

주의:
- dispatcher 레이어는 팝업/사운드/마퀴 `enabled`를 직접 차단하지 않는다.
- 실제 표시 여부는 각 컴포넌트가 `settings`를 보고 결정한다.

---

## 6. 설정 구조

### 6.1 서버 기본값
소스: `shared/alert-defaults.js` (`/api/alert-defaults`로 제공)

```js
{
  global: {
    alerts_enabled: true,
    poll_interval_seconds: 300,
    cooldown_seconds: 300,
    quiet_hours: null
  },
  dispatchers: {
    popup: { enabled: true, auto_dismiss_seconds: 10, max_visible: 5, position: "top-right" },
    sound: { enabled: true, volume: 70, repeat_count: { info: 1, warning: 1, critical: 3 } },
    marquee: { enabled: true, min_severity: "warning", speed: "normal", show_duration_seconds: 30 }
  },
  triggers: { ...T-01~T-08 기본 파라미터... }
}
```

### 6.2 개인 설정(localStorage)
- 키: `aviation-weather-alert-settings`
- 병합 함수: `resolveSettings(defaults)` (deep merge)
- 저장/초기화:
  - `savePersonalSettings(overrides)`
  - `clearPersonalSettings()`
  - `loadPersonalSettings()`

### 6.3 조용 시간
- `isQuietHours(quiet_hours)`가 현재 시각을 `HH:mm` 문자열로 비교
- 자정 넘어가는 구간(`22:00~06:00`)도 지원

---

## 7. App 연동 포인트

`frontend/src/App.jsx`:
- 콜백 등록:
  - `setAlertCallback(alertObj => setActiveAlerts(...))`
- 평가 게이트:
  - `selectedAirport` 존재
  - `settings.global.alerts_enabled === true`
  - `!isQuietHours(settings.global.quiet_hours)`
- 주기 재로딩:
  - `settings.global.poll_interval_seconds` 기반 `setInterval(loadAll)`

---

## 8. 검증 체크리스트

| # | 테스트 케이스 | 기대 결과 |
|---|---|---|
| 1 | 경보 신규 발령 | `warning_issued` 생성 |
| 2 | 경보 해제 | `warning_cleared` 생성 |
| 3 | 동일 조건 반복 | 쿨다운 내 재알림 차단 |
| 4 | 조건 해소 | `clearResolvedAlerts`로 이력 제거 |
| 5 | quiet_hours 활성 | 알림 평가/디스패치 중단 |
| 6 | trigger 비활성 | 해당 트리거 결과 미생성 |
| 7 | popup 비활성 | 팝업 UI 미표시(콜백 데이터는 생성 가능) |
| 8 | sound 비활성 | beep 미재생 |
| 9 | marquee 최소 심각도 | 기준 이하 severity만 노출 |
| 10 | 낙뢰 신규 strike 없음 | `lightning_detected` 미발동 |

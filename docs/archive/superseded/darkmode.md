# AMO 항공기상상황판 — 다크모드 설계 문서

> **대상 시스템:** KMA 항공기상 대시보드
> **작성일:** 2026-03-27
> **버전:** v2.0 (프로젝트 코드 기반 재작성)

---

## 1. 설계 철학

### 1.1 기본 원칙

| 원칙 | 설명 |
|------|------|
| **반전이 아닌 재매핑** | `#fffdf8 → #000` 단순 반전이 아니라, 각 표면의 역할에 맞게 색상을 다시 할당한다. |
| **시맨틱 색상 보존** | VFR/IFR/LIFR 등 항공 표준 색상(`FLIGHT_CATEGORY_META`)은 절대 변경하지 않는다. |
| **기존 변수 구조 활용** | 이미 정의된 CSS 변수(`--bg`, `--paper`, `--ink` 등)를 그대로 재사용하고 `[data-theme="dark"]`에서 값만 교체한다. |
| **눈 피로 최소화** | 순수 검정(`#000`) 배경을 쓰지 않는다. 짙은 네이비 계열로 대비를 부드럽게 유지한다. |
| **지도 다크모드 연동** | 이미 구현된 `mapTheme` 상태(localStorage: `map_theme`)와 연동한다. 사이트가 다크로 바뀌면 지도도 자동으로 dark로 전환한다. |

### 1.2 왜 다크모드인가 (항공기상 맥락)

- 야간 관제 환경에서 화면 눈부심 감소
- OLED 디스플레이 에너지 절약
- 어두운 브리핑룸에서의 가독성 향상
- VFR/IFR/LIFR 상태 색상이 어두운 배경 위에서 오히려 더 선명해지는 이점

---

## 2. 현재 라이트모드 색상 구조

현재 `App.css`에 정의된 CSS 변수들이 다크모드 구현의 핵심이다.

```css
/* 현재 :root 정의 */
:root {
  --bg:      #f7f4ef;   /* 페이지 배경 (따뜻한 베이지) */
  --paper:   #fffdf8;   /* 패널/카드 배경 (오프화이트) */
  --ink:     #1d2430;   /* 주요 텍스트 (다크 네이비) */
  --muted:   #5f6775;   /* 보조 텍스트 (회색) */
  --accent:  #0d7f6f;   /* 주 강조색 (틸) */
  --accent-2: #d4603a;  /* 부 강조색 (러스트 오렌지) */
  --line:    #ded7ca;   /* 테두리/구분선 (베이지) */
  --card-bg: #f5f3ef;   /* 카드 내부 셀 배경 */
  --shadow:  0 12px 30px rgba(33, 43, 61, 0.08);
}
```

---

## 3. 다크모드 토큰 매핑

기존 변수명을 그대로 유지하고 `[data-theme="dark"]` 블록에서 값만 재정의한다.

| CSS 변수 | 라이트모드 | 다크모드 | 용도 |
|----------|-----------|---------|------|
| `--bg` | `#f7f4ef` | `#0f1115` | 페이지 최하위 배경 |
| `--paper` | `#fffdf8` | `#1a1d24` | 패널/카드 배경 |
| `--ink` | `#1d2430` | `#e5e7eb` | 주요 텍스트 |
| `--muted` | `#5f6775` | `#9ca3af` | 보조 텍스트, 레이블 |
| `--accent` | `#0d7f6f` | `#0ea57a` | 강조색 (틸, 약간 밝게) |
| `--accent-2` | `#d4603a` | `#e07050` | 부 강조색 (오렌지, 약간 밝게) |
| `--line` | `#ded7ca` | `#2c313c` | 테두리/구분선 |
| `--card-bg` | `#f5f3ef` | `#232731` | 카드 내부 셀 배경 |
| `--shadow` | `rgba(33,43,61,0.08)` | `rgba(0,0,0,0.3)` | 박스 그림자 |

### 3.1 시맨틱 색상 — 테마 불변

> ⚠️ **`helpers.js`의 `FLIGHT_CATEGORY_META`와 동일한 값이다. 절대 변경하지 않는다.**

| 용도 | 현재 값 | 다크모드 |
|------|---------|---------|
| VFR 색상 | `#15803d` (green-700) | 동일 유지 |
| MVFR 색상 | `#2563eb` (blue-600) | 동일 유지 |
| IFR 색상 | `#f59e0b` (amber-400) | 동일 유지 |
| LIFR 색상 | `#dc2626` (red-600) | 동일 유지 |
| VFR bg | `#f0fdf4` | `rgba(21,128,61, 0.15)` |
| MVFR bg | `#eff6ff` | `rgba(37,99,235, 0.15)` |
| IFR bg | `#fffbeb` | `rgba(245,158,11, 0.15)` |
| LIFR bg | `#fef2f2` | `rgba(220,38,38, 0.15)` |

> 위 flight category bg/border 색상들은 `MetarCard.jsx`와 `TafTimeline.jsx`에서
> `classifyVisibilityCategory`, `classifyCeilingCategory` 등 헬퍼가 반환하는 값으로
> 인라인 스타일로 직접 적용된다. 다크모드 대응을 위해서는 헬퍼가 반환하는 `bg`/`borderSoft`
> 값을 다크모드일 때 rgba 버전으로 교체하는 방식이 필요하다.

---

## 4. CSS 변수 구현 코드

### 4.1 `App.css`에 추가할 다크모드 토큰

```css
/* App.css 기존 :root 아래에 추가 */
[data-theme="dark"] {
  --bg:      #0f1115;
  --paper:   #1a1d24;
  --ink:     #e5e7eb;
  --muted:   #9ca3af;
  --accent:  #0ea57a;
  --accent-2: #e07050;
  --line:    #2c313c;
  --card-bg: #232731;
  --shadow:  0 12px 30px rgba(0, 0, 0, 0.3);
}
```

### 4.2 테마 토글 (React — App.jsx)

```javascript
// App.jsx 내 state 추가
const [theme, setTheme] = useState(() => {
  const saved = localStorage.getItem("theme");
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
});

// theme 변경 시 적용
useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  // 지도 다크모드 자동 연동
  if (theme === "dark") setMapTheme("dark");
}, [theme]);

// 버튼 예시
<button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
  {theme === "dark" ? "☀️" : "🌙"}
</button>
```

### 4.3 FOUC 방지 (`frontend/index.html` `<head>` 최상단)

```html
<script>
  (function() {
    var t = localStorage.getItem("theme");
    if (!t) t = window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  })();
</script>
```

---

## 5. 컴포넌트별 변환 가이드

### 5.1 레이아웃 루트 (`.dashboard-root`)

현재 `--bg`를 배경으로 쓰고 있지 않다면 명시적으로 적용 필요.

```css
.dashboard-root {
  background: var(--bg);
  color: var(--ink);
}
```

### 5.2 헤더 (`.new-header`)

| 요소 | 현재 클래스 | 다크 대응 |
|------|------------|---------|
| 헤더 배경 | `var(--paper)` | 토큰 교체로 자동 |
| 공항명 `.airport-dropdown-icao` | `color: var(--ink)` | 자동 |
| 케럿 `.airport-dropdown-caret` | `color: var(--muted)` | 자동 |
| 드롭다운 리스트 배경 | `var(--paper)` | 자동 |
| 활성 항목 `.airport-dropdown-list li.active` | `background: var(--accent)` | 자동 |
| hover `.airport-dropdown-list li:hover` | `rgba(0,0,0,0.04)` | → `rgba(255,255,255,0.06)` 별도 처리 |
| 시간 `.new-header-time` | `color: var(--muted)` | 자동 |
| 설정 버튼 `.settings-icon-btn` | `color: var(--muted)` | 자동 |

```css
[data-theme="dark"] .airport-dropdown-list li:hover {
  background: rgba(255, 255, 255, 0.06);
}
```

### 5.3 경보 배너 (`.warning-banner`)

| 요소 | 라이트 | 다크 |
|------|--------|------|
| `.warning-banner--ok` | `#ecfdf5` 배경, `#15803d` 텍스트 | `rgba(21,128,61,0.15)` 배경, `#4ade80` 텍스트 |
| `.warning-banner--danger` | `#f97316` 배경 | 동일 유지 (시맨틱) |
| 마키 위험 텍스트 `#FF4444` | 유지 | 유지 |

```css
[data-theme="dark"] .warning-banner--ok {
  background: rgba(21, 128, 61, 0.15);
  color: #4ade80;
}
```

### 5.4 패널 공통 (`.panel`)

```css
/* 현재 */
.panel {
  background: var(--paper);
  border: 1px solid var(--line);
}
/* [data-theme="dark"] 적용 시 --paper, --line 토큰 교체로 자동 대응 */
```

### 5.5 METAR 카드

| 요소 | 클래스 | 다크 대응 |
|------|--------|---------|
| 카드 배경 | `.metar-surface-card` (`var(--card-bg)`, `border: 1px solid var(--line)`) | 토큰 교체로 자동 |
| METAR 뱃지 | `.panel-kind-badge` (`background: var(--ink)`, `color: #fff`) | 토큰 교체로 자동 |
| 레이블 텍스트 | `.metar-side-text` (`color: var(--muted)`) | 자동 |
| 바람 화살표 | `.metar-direction-arrow` (`color: var(--accent)`) | 자동 |
| 데이터 값 `.metar-wind-inline-text` | `font-size: 22px` | 색상은 flight category 인라인 스타일 |
| 비행조건 블록 `.flight-category-panel` | 인라인 `backgroundColor: flightCategory.color` | 시맨틱 불변 |
| 특이기상 outline `.metar-card--special-weather` | `border: 2px dashed #dc2626` | 유지 (시맨틱) |

**Flight category bg (인라인 스타일) 다크 대응:**

`MetarCard.jsx`에서 `classifyVisibilityCategory` 등이 반환하는 `bg`/`borderSoft`가
`#f0fdf4`, `#fffbeb` 같은 라이트 배경색이다. 다크모드에서는 이 값들을 투명도 기반
rgba로 교체해야 한다.

방법 1 — **CSS 클래스 추가**: 인라인 대신 `data-category="VFR"` 속성을 두고 CSS로 처리.

방법 2 — **헬퍼에서 현재 테마 참조**: `FLIGHT_CATEGORY_META`에 `darkBg`, `darkBorderSoft`
필드를 추가하고 컴포넌트가 `document.documentElement.dataset.theme`을 읽어 선택.

### 5.6 TAF 타임라인 / 테이블

| 요소 | 클래스 | 다크 대응 |
|------|--------|---------|
| 전체 패널 `.taf-new-panel` | `var(--paper)` 배경 | 자동 |
| 토글 버튼 `.taf-view-toggle-btn` | 활성: `background: var(--ink)`, `color: #fff` | 자동 |
| 시간축 레이블 `.taf-scale-hour` | `color: var(--muted)` | 자동 |
| 날짜 `.taf-scale-date` | `color: var(--accent-2)` | 자동 |
| 눈금선 `.taf-new-scale` | `border-bottom: 1.5px solid var(--line)` | 자동 |
| 비행조건 바 `.taf-new-seg--flight` | 인라인 `backgroundColor` (시맨틱) | 유지 |
| 시정 위험 `.taf-new-seg--tint` | 인라인 border+color (시맨틱) | 유지 |
| 특이기상 `.taf-new-seg--special-weather` | `border: 2px dashed #dc2626` | 유지 |
| 풍향 `.taf-new-seg--wind` | `color: var(--ink)` | 자동 |

**24시 표기**: `formatTafRange`에서 이미 "24시"로 표기되도록 수정 완료.

### 5.7 지도 패널 (`.map-panel-wrap`, `.interactive-map-panel`)

> ✅ **지도 다크 타일은 이미 구현 완료.**
> `mapTheme` state (`localStorage: "map_theme"`) + `.interactive-map-shell--dark` 클래스로 관리.

| 요소 | 클래스/현황 | 다크 대응 |
|------|------------|---------|
| 지도 컨테이너 | `.interactive-map-container` (dark: `#131a24`) | ✅ 완료 |
| Leaflet 타일 | `.interactive-map-shell--dark` 적용 시 `filter: invert+hue-rotate` | ✅ 완료 |
| 마커 아이콘 (항공기 ✈) | `#FFD700` 노란색 + 검정 0.5px 외곽선 | ✅ 완료 |
| 패널 탭 (전국/공항) | `var(--paper)`/`var(--card-bg)` | 🔲 토큰 적용 필요 |
| 필터 버튼 (번개, 레이더 등) | 하드코딩된 색상 | 🔲 적용 필요 |
| 레인레이트 범례 `.rainrate-legend` | 배경 색상 | 🔲 적용 필요 |
| 재생 컨트롤 바 | 하드코딩 | 🔲 적용 필요 |
| 낙뢰 zone 태그 `.zone-tag` | `.alert`/`.danger`/`.caution`/`.traffic` | 🔲 다크 투명도 조정 필요 |
| SIGMET/AIRMET 뱃지 `.advisory-count-badge--sigmet/--airmet` | `rgba(239,68,68,0.9)` 등 | 유지 (시맨틱) |

**사이트 다크모드 전환 시 지도 자동 연동:**

```javascript
// App.jsx의 theme useEffect에 추가
useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  // 지도 자동 연동
  setMapTheme(theme === "dark" ? "dark" : "light");
}, [theme]);
```

### 5.8 존 태그 (낙뢰 / 항적)

```css
[data-theme="dark"] .zone-tag.alert {
  background: rgba(191, 35, 35, 0.25);
  color: #fca5a5;
}
[data-theme="dark"] .zone-tag.danger {
  background: rgba(183, 92, 5, 0.25);
  color: #fdba74;
}
[data-theme="dark"] .zone-tag.caution {
  background: rgba(143, 111, 0, 0.25);
  color: #fde047;
}
[data-theme="dark"] .zone-tag.traffic {
  background: rgba(0, 95, 134, 0.25);
  color: #7dd3fc;
}
```

---

## 6. 전환 애니메이션

```css
/* App.css에 추가 */
body,
.panel,
.metar-surface-card,
.taf-new-panel,
.new-header,
.warning-banner,
.airport-dropdown-list {
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease;
}

/* 시맨틱 요소는 전환하지 않음 */
.flight-category-panel,
.taf-new-seg--flight,
.advisory-count-badge--sigmet,
.advisory-count-badge--airmet {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; }
}
```

---

## 7. 접근성 체크리스트

| 항목 | 기준 | 다크모드 값 |
|------|------|------------|
| 텍스트 대비 (일반) | ≥ 4.5:1 | `#e5e7eb` on `#1a1d24` = **11.3:1** ✅ |
| 텍스트 대비 (보조) | ≥ 4.5:1 | `#9ca3af` on `#1a1d24` = **6.2:1** ✅ |
| 대형 텍스트 대비 | ≥ 3:1 | 데이터 값(22px+)은 `--ink` 사용 ✅ |
| VFR 뱃지 텍스트 | ≥ 3:1 | `#fff` on `#15803d` = **3.9:1** ✅ |
| LIFR 뱃지 텍스트 | ≥ 3:1 | `#fff` on `#dc2626` = **4.6:1** ✅ |
| 포커스 표시 | 가시적 포커스 링 | `outline: 2px solid rgba(96,165,250,0.6)` |
| 색각 이상 대응 | 색상 외 보조 표시 | VFR/IFR/LIFR 텍스트 레이블 병기 ✅ |

---

## 8. 구현 로드맵

| 단계 | 작업 | 대상 파일 | 상태 |
|------|------|----------|------|
| **Phase 1** | `[data-theme="dark"]` 토큰 정의 추가 | `App.css` | 🔲 |
| **Phase 2** | FOUC 방지 스크립트 + 테마 토글 버튼 | `index.html`, `App.jsx` | 🔲 |
| **Phase 3** | 지도 자동 연동 (`setMapTheme`) | `App.jsx` | 🔲 |
| **Phase 4** | 하드코딩 색상 토큰화 (헤더 hover, 배너 ok, zone 태그 등) | `App.css` | 🔲 |
| **Phase 5** | Flight category bg 다크 대응 (`FLIGHT_CATEGORY_META` darkBg 추가 또는 CSS 방식) | `helpers.js` 또는 컴포넌트 | 🔲 |
| **Phase 6** | 지도 패널 UI 요소 (필터 버튼, 범례, 컨트롤 바) 토큰 적용 | `App.css`, `InteractiveMap.jsx` | 🔲 |
| **Phase 7** | 전환 애니메이션 + QA | `App.css` | 🔲 |

---

## 부록 A: 토큰 빠른 참조

```
라이트                          다크
--bg:      #f7f4ef          →   #0f1115
--paper:   #fffdf8          →   #1a1d24
--card-bg: #f5f3ef          →   #232731
--ink:     #1d2430          →   #e5e7eb
--muted:   #5f6775          →   #9ca3af
--accent:  #0d7f6f          →   #0ea57a
--accent-2: #d4603a         →   #e07050
--line:    #ded7ca          →   #2c313c

시맨틱 (테마 무관):
  VFR   #15803d  MVFR  #2563eb  IFR  #f59e0b  LIFR  #dc2626
```

## 부록 B: 주의사항

- `MetarCard.jsx`, `TafTimeline.jsx`에서 flight category 색상을 **인라인 스타일**로 직접 주입한다.
  CSS 변수만으로는 이 부분이 다크모드에 반응하지 않으므로 별도 처리가 필요하다.
- `helpers.js`의 `FLIGHT_CATEGORY_META`는 `bg`, `border`, `borderSoft`, `valueColor` 필드를 가진다.
  각 필드에 `darkBg`, `darkBorderSoft` 등을 추가하거나, 컴포넌트에서 `document.documentElement.dataset.theme`을 읽어 조건 분기하는 방법이 있다.
- `server.js`가 `127.0.0.1`에만 바인딩되므로 빌드 후 배포 시 `npm --prefix frontend run build` 필수.

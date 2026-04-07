# Advisory Filter Design

SIGMET, AIRMET, SIGWX 각각에 대해 현상(phenomenon) 단위로 표시 여부를 제어하는 필터 기능 설계.

---

## 1. 설계 목표

- 설정창 내 "어드바이저리 필터" 탭에서 SIGMET / AIRMET / SIGWX 각각의 현상 그룹을 chip 토글로 켜고 끌 수 있다.
- 필터 상태는 `localStorage`에 저장되어 페이지 새로고침 후에도 유지된다.
- 필터 OFF 상태인 그룹은 지도 오버레이와 패널 목록 양쪽에서 모두 숨겨진다.
- 현재 데이터에 없는 코드(미래 추가 예정)도 필터 목록에 미리 정의해 두어, 파서/프로세서 확장 시 필터만 연결하면 바로 동작하도록 한다.

---

## 2. 필터 그룹 정의

### 2-1. SIGMET

`phenomenon_code` 기준으로 그룹화. 동일 현상의 강도 차이(SEV/MOD)는 한 그룹으로 묶는다.

| 필터 key | 표시명 | 묶이는 phenomenon_code | 현재 구현 여부 |
|---|---|---|---|
| `thunderstorm` | 뇌우 | `TS`, `EMBD_TS`, `OBSC_TS`, `FRQ_TS`, `SQL_TS`, `CB` | ✅ 일부 수집됨 |
| `turbulence` | 난류 | `SEV_TURB`, `MOD_TURB`, `MTW` | ✅ SEV_TURB 수집됨 |
| `icing` | 착빙 | `SEV_ICE`, `MOD_ICE` | ✅ SEV_ICE 수집됨 |
| `tropical_cyclone` | 열대성 저기압 | `TC` | ⬜ 미구현 (코드 정의됨) |
| `volcanic_ash` | 화산재 | `VA` | ⬜ 미구현 (코드 정의됨) |
| `hail` | 우박 | `GR` | ⬜ 미구현 (코드 정의됨) |
| `duststorm` | 황사/모래폭풍 | `HVY_DS`, `HVY_SS` | ⬜ 미구현 (파서 미지원) |

> `HVY_DS`, `HVY_SS` 추가 시: `iwxxm-advisory-parser.js`의 `PHENOMENON_LABELS`에 코드 추가 필요.

### 2-2. AIRMET

| 필터 key | 표시명 | 묶이는 phenomenon_code | 현재 구현 여부 |
|---|---|---|---|
| `sfc_wind` | 지상 강풍 | `SFC_WIND` | ✅ 수집됨 (KMA 자체 코드) |
| `sfc_vis` | 지상 시정 | `SFC_VIS`, `IFR` | ✅ SFC_VIS 수집됨 |
| `icing` | 착빙 | `MOD_ICE` | ⬜ 미구현 (AIRMET 전용 보통 착빙) |
| `turbulence` | 난류 | `MOD_TURB` | ⬜ 미구현 (AIRMET 전용 보통 난류) |
| `mountain_obscuration` | 산악 차폐 | `MT_OBSC` | ⬜ 미구현 (파서 정의됨) |
| `llws` | 저고도 윈드시어 | `LLWS` | ⬜ 미구현 (파서 정의됨) |

> `SFC_WIND`는 ICAO 표준 코드가 아닌 KMA 자체 확장 코드임.

### 2-3. SIGWX

`contour_name` 기준 그룹 단위 필터. `buildSigwxGroups()`의 primary item(type 4)과 그 childItems 전체를 함께 숨긴다.

| 필터 key | 표시명 | contour_name | 현재 구현 여부 |
|---|---|---|---|
| `freezing_level` | 빙결고도 | `freezing_level` | ✅ |
| `icing_area` | 착빙구역 | `icing_area` | ✅ |
| `turbulence` | 난류 | `ktg` | ✅ |
| `cloud` | 구름/CB | `cld` | ✅ |
| `sfc_vis` | 지상 시정 | `sfc_vis` | ✅ |
| `sfc_wind` | 지상 바람 | `sfc_wind` | ✅ |
| `mountain_obscuration` | 산악 차폐 | `mountain_obscu` | ✅ |
| `pressure` | 저/고기압 | `pressure` | ✅ |
| `front_line` | 전선 | `font_line` | ✅ (데이터 있을 때) |
| `jet_stream` | 제트기류 | `z_stream` | ✅ (데이터 있을 때) |

---

## 3. localStorage 저장 구조

키: `advisory_filter_settings`

```json
{
  "sigmet": {
    "thunderstorm": true,
    "turbulence": true,
    "icing": true,
    "tropical_cyclone": true,
    "volcanic_ash": true,
    "hail": true,
    "duststorm": true
  },
  "airmet": {
    "sfc_wind": true,
    "sfc_vis": true,
    "icing": true,
    "turbulence": true,
    "mountain_obscuration": true,
    "llws": true
  },
  "sigwx": {
    "freezing_level": true,
    "icing_area": true,
    "turbulence": true,
    "cloud": true,
    "sfc_vis": true,
    "sfc_wind": true,
    "mountain_obscuration": true,
    "pressure": true,
    "front_line": true,
    "jet_stream": true
  }
}
```

기본값은 전부 `true` (모두 표시). 저장된 값이 없으면 기본값 사용.

---

## 4. phenomenon_code → 필터 key 매핑 함수

`frontend/src/utils/advisory-filter.js` (신규 파일)에 정의 예정.

```js
// SIGMET phenomenon_code → filter group key
export const SIGMET_FILTER_GROUPS = {
  thunderstorm: ["TS", "EMBD_TS", "OBSC_TS", "FRQ_TS", "SQL_TS", "CB"],
  turbulence:   ["SEV_TURB", "MOD_TURB", "MTW"],
  icing:        ["SEV_ICE", "MOD_ICE"],
  tropical_cyclone: ["TC"],
  volcanic_ash: ["VA"],
  hail:         ["GR"],
  duststorm:    ["HVY_DS", "HVY_SS"],
};

// AIRMET phenomenon_code → filter group key
export const AIRMET_FILTER_GROUPS = {
  sfc_wind:             ["SFC_WIND"],
  sfc_vis:              ["SFC_VIS", "IFR"],
  icing:                ["MOD_ICE"],
  turbulence:           ["MOD_TURB"],
  mountain_obscuration: ["MT_OBSC"],
  llws:                 ["LLWS"],
};

// SIGWX contour_name → filter group key (1:1 매핑)
export const SIGWX_FILTER_GROUPS = {
  freezing_level:       ["freezing_level"],
  icing_area:           ["icing_area"],
  turbulence:           ["ktg"],
  cloud:                ["cld"],
  sfc_vis:              ["sfc_vis"],
  sfc_wind:             ["sfc_wind"],
  mountain_obscuration: ["mountain_obscu"],
  pressure:             ["pressure"],
  front_line:           ["font_line"],
  jet_stream:           ["z_stream"],
};

// phenomenon_code가 어느 필터 key에 속하는지 역방향 조회
export function getSigmetFilterKey(phenomenonCode) { ... }
export function getAirmetFilterKey(phenomenonCode) { ... }
export function getSigwxFilterKey(contourName) { ... }

// 필터 설정 load/save
export function loadAdvisoryFilterSettings() { ... }
export function saveAdvisoryFilterSettings(settings) { ... }
export function getDefaultAdvisoryFilterSettings() { ... }
```

---

## 5. 필터 적용 위치

### 5-1. SIGMET / AIRMET

`InteractiveMap.jsx`의 `visibleSigmetItems`, `visibleAirmetItems` useMemo에 필터 조건 추가:

```js
const visibleSigmetItems = useMemo(() => {
  const hidden = new Set(hiddenAdvisoryKeys.sigmet);
  return sigmetItems.filter((item) => {
    if (hidden.has(item.mapKey)) return false;
    const key = getSigmetFilterKey(item.phenomenon_code);
    if (key && advisoryFilter.sigmet[key] === false) return false;
    return true;
  });
}, [hiddenAdvisoryKeys.sigmet, sigmetItems, advisoryFilter.sigmet]);
```

### 5-2. SIGWX

`visibleSigwxLowItems` useMemo에 contour_name 기반 필터 추가:

```js
const visibleSigwxLowItems = useMemo(() => {
  const hidden = new Set(hiddenAdvisoryKeys.sigwxLow);
  return sigwxLowItems.filter((item) => {
    if (hidden.has(sigwxLowParentMap.get(item.mapKey) || item.mapKey)) return false;
    const key = getSigwxFilterKey(item.contour_name);
    if (key && advisoryFilter.sigwx[key] === false) return false;
    return true;
  });
}, [hiddenAdvisoryKeys.sigwxLow, sigwxLowItems, sigwxLowParentMap, advisoryFilter.sigwx]);
```

---

## 6. UI 구조 (설정창 탭)

설정창(`Settings.jsx`)에 `"advisory"` 탭 추가.

```
탭: 일반 | 알림 | 항적 | MINIMA | 어드바이저리 ← 신규
```

탭 내부 구조:

```
┌─ SIGMET ────────────────────────────── [전체 해제] ─┐
│  [뇌우]  [난류]  [착빙]  [열대저기압]                  │
│  [화산재]  [우박]  [황사/모래폭풍]                      │
└─────────────────────────────────────────────────────┘
┌─ AIRMET ────────────────────────────── [전체 해제] ─┐
│  [지상강풍]  [지상시정]  [착빙]  [난류]                 │
│  [산악차폐]  [저고도윈드시어]                           │
└─────────────────────────────────────────────────────┘
┌─ SIGWX ─────────────────────────────── [전체 해제] ─┐
│  [빙결고도]  [착빙구역]  [난류]  [구름/CB]              │
│  [지상시정]  [지상바람]  [산악차폐]                     │
│  [저/고기압]  [전선]  [제트기류]                        │
└─────────────────────────────────────────────────────┘
```

chip 스타일: 활성 = 색상 있는 배지, 비활성 = 회색. 섹션별 "전체 해제/선택" 버튼.

---

## 7. Props 흐름

```
App.jsx
  └─ advisoryFilter state (load from localStorage)
  └─ Settings.jsx (탭에서 편집)
  └─ InteractiveMap.jsx (prop으로 전달, visibleXxx useMemo에 사용)
```

---

## 8. 미래 추가 시 체크리스트

새 phenomenon_code 파서 지원 추가 시:
1. `iwxxm-advisory-parser.js`의 `PHENOMENON_LABELS`에 코드/라벨 추가
2. `advisory-filter.js`의 해당 그룹 배열에 코드 추가 (이미 필터 key는 정의됨)
3. 추가 작업 없이 필터 UI에 자동 반영됨

새 SIGWX `contour_name` 추가 시:
1. `SIGWX_FILTER_GROUPS`에 새 key와 contour_name 추가
2. 설정창 chip 라벨 추가
3. 기본값 `true` 추가

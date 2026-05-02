# Basmilius Weather Icon Adoption Plan

## 1. 목표

현재 `frontend/src/components/WeatherIcon.jsx`는 실제 이미지 자산이 아니라 코드 내부 `EMOJI_MAP`으로 현재날씨 아이콘을 표시한다.

이번 작업의 목표는 다음과 같다.

- 임시 이모지 기반 표시를 실제 SVG 아이콘 기반 표시로 교체한다.
- 기상현상 판단 로직과 아이콘 자산 로딩 로직을 분리한다.
- Basmilius Weather Icons를 프로젝트 내부 자산으로 vendoring 한다.
- METAR/TAF 공통으로 사용할 수 있는 표준 `iconId` 체계를 정의한다.
- 이후 아이콘 공급처를 바꾸더라도 매핑 로직은 최대한 유지할 수 있게 한다.

이번 문서는 "어떤 조건으로 어떤 아이콘을 고를지"와 "아이콘 파일을 어떻게 프로젝트에 가져와서 사용할지"를 먼저 확정하기 위한 설계 문서다.

## 2. 선택한 아이콘 소스

도입 대상:

- Basmilius Weather Icons

선정 이유:

- SVG 자산 품질이 높고 주간/야간 변형이 잘 갖춰져 있다.
- 날씨 중심 아이콘 세트라 METAR/TAF 시각화에 잘 맞는다.
- React + Vite 환경에서 정적 import 방식으로 관리하기 좋다.
- 로컬 자산으로 vendoring 하면 런타임 외부 의존성이 없다.

라이선스 메모:

- 사용 전제는 MIT license 기반 무료 사용 가능 리포지토리라는 점이다.
- 실제 도입 시 프로젝트 내부에 라이선스 사본을 함께 보관한다.

## 3. 비목표

이번 단계에서 바로 하지 않는 것:

- 모든 METAR 코드에 대해 1:1 완전 개별 아이콘 제작
- 아이콘 자체 디자인 수정
- 날씨 아이콘 애니메이션 도입
- 경고/레이더/낙뢰/SIGMET/AIRMET용 아이콘 통합
- wind barb 체계 재설계

이번 단계는 현재날씨 및 TAF 시각화에 필요한 날씨 아이콘 체계를 정리하는 데 집중한다.

## 4. 현재 구조 요약

현재 흐름:

1. 백엔드가 METAR/TAF를 파싱하면서 `weather`, `clouds`, `cavok`, `display.weather_icon`을 만든다.
2. 프런트의 `resolveIconKey()`가 `display.weather_icon`을 우선 사용하고, 없으면 `weather[0]`, 없으면 `clouds`, 마지막으로 `CAVOK/SKC`로 fallback 한다.
3. `WeatherIcon.jsx`가 최종 키를 받아 이모지로 렌더링한다.

현재 문제:

- 실제 이미지 자산이 없어서 화면 품질이 낮다.
- 아이콘 키와 렌더링이 느슨하게 연결되어 있다.
- 향후 아이콘 세트 교체, 주/야간 확장, fallback 조정 시 수정 지점이 분산된다.

## 5. 설계 원칙

핵심 원칙은 세 가지다.

- 기상현상 판정과 자산 로딩을 분리한다.
- 외부 아이콘 이름을 직접 UI 전체에 노출하지 않는다.
- 공급처 고유 이름 대신 프로젝트 표준 `iconId`를 만든다.

즉 최종 구조는 아래와 같다.

```text
METAR/TAF parsed data
  -> resolveWeatherVisual(data, time)
  -> standard iconId
  -> icon registry lookup
  -> WeatherIcon render
```

## 6. 표준 iconId 체계

### 6.1 기본 규칙

프로젝트 내부 표준 아이콘 키는 공급처 파일명과 분리한다.

예:

- `clear-day`
- `clear-night`
- `few-clouds-day`
- `few-clouds-night`
- `scattered-clouds-day`
- `broken-clouds`
- `overcast`
- `rain-day`
- `rain-night`
- `snow-day`
- `snow-night`
- `showers-day`
- `showers-night`
- `thunderstorm-day`
- `thunderstorm-night`
- `fog-day`
- `fog-night`
- `haze-day`
- `haze-night`
- `freezing-rain`
- `hail`
- `dust`
- `severe-wind`
- `unknown`

원칙:

- 주/야 구분이 의미 있는 아이콘만 `-day`, `-night`로 분리한다.
- 구름이 많은 상태(`broken`, `overcast`)처럼 주/야 차이가 약한 것은 공용 키를 허용한다.
- METAR 원시 코드 그대로를 파일명 체계로 쓰지 않는다.

### 6.2 왜 METAR 코드 그대로 쓰지 않는가

`TSRA`, `SHRASN`, `BCFG`, `DRDU` 같은 코드를 그대로 자산 키로 사용하면 다음 문제가 생긴다.

- 아이콘 수가 과도하게 늘어난다.
- Basmilius 원본 자산명과 직접 호환되지 않는다.
- 육안으로 구분하기 어려운 변형까지 파일 단위로 쪼개게 된다.

따라서 "기상 코드"와 "시각적 그룹"을 분리해야 한다.

### 6.3 강수 강도는 별도 오버레이로 처리

강수 강도는 구분하되, 아이콘 파일 자체를 강도별로 나누지는 않는다.

권장 방식:

- 본체 아이콘은 현상 종류를 표현한다.
- 강도는 별도 오버레이 또는 작은 배지로 표현한다.

예:

- `-RA` -> `rain-day/night` + `light` overlay
- `RA` -> `rain-day/night` + overlay 없음
- `+RA` -> `rain-day/night` + `heavy` overlay
- `+TSRA` -> `thunderstorm-day/night` + `heavy` overlay

이 방식을 선택하는 이유:

- 자산 수가 폭증하지 않는다.
- 사용자는 먼저 "무슨 현상인지"를 빠르게 읽고, 그 다음 "얼마나 강한지"를 읽을 수 있다.
- 공급처 아이콘 세트를 바꿔도 강도 정책은 별도로 유지할 수 있다.

초기 정책:

- `LIGHT` -> `light` overlay
- `MODERATE` -> overlay 없음
- `HEAVY` -> `heavy` overlay
- `VICINITY` -> `vicinity` overlay

초기 시각 표현 후보:

- `light` -> 작은 `-`
- `heavy` -> 작은 `+`
- `vicinity` -> 작은 `VC`

즉, 이번 설계에서 관리 대상은 `iconId`와 별도의 `intensityOverlay` 두 축이다.

## 7. 기상현상 분류 규칙

### 7.1 최종 판단 우선순위

아이콘은 아래 우선순위로 결정한다.

1. `weather[]`의 대표 현상
2. 대표 현상이 없으면 `clouds[]`
3. 구름 정보도 없으면 `cavok`
4. 아무것도 없으면 `unknown`

주/야간 여부는 마지막에 붙인다.

### 7.2 weather[] 대표 현상 선정

기존 백엔드의 대표 현상 우선순위는 유지한다.

- `TS*`
- `FZ*`
- `SH*`
- 일반 강수
- 시정장애
- 기타

즉 다중 현상이라도 일단 하나의 대표 `iconId`를 선택한다.

예:

- `+TSRA BR` -> `thunderstorm-day/night`
- `FZRA FG` -> `freezing-rain`
- `SHSN BR` -> `showers-snow` 또는 단순화 시 `snow-showers`
- `RA BR` -> `rain-day/night`

초기 버전에서는 복수 아이콘 나열보다 단일 대표 아이콘 방식을 우선한다.

대표 현상을 정한 뒤에는 별도로 강도 오버레이를 판정한다.

- 대표 weather item의 `intensity`를 사용한다.
- `LIGHT`, `HEAVY`, `VICINITY`만 오버레이를 부여한다.
- `MODERATE`는 기본 상태로 본다.

예:

- `+TSRA BR` -> `thunderstorm-day/night` + `heavy`
- `-RA BR` -> `rain-day/night` + `light`
- `VCSH` -> `showers-day/night` + `vicinity`

### 7.3 시각적 그룹 제안

METAR 코드를 그대로 쓰지 않고 아래처럼 묶는다.

#### A. Thunderstorm

대상:

- `TS`
- `TSRA`
- `TSSN`
- `TSGR`
- `TSGS`
- `TSRASN`
- `TSSNGR`

표준 키:

- `thunderstorm-day`
- `thunderstorm-night`

#### B. Showers

대상:

- `SH`
- `SHRA`
- `SHSN`
- `SHGR`
- `SHGS`
- `SHRASN`

초기 단순화:

- 비 중심이면 `showers-day/night`
- 눈 중심이면 `snow-showers-day/night`
- 우박 중심이면 `hail`

#### C. Rain

대상:

- `RA`
- `DZ`
- `UP`

표준 키:

- `rain-day`
- `rain-night`

`DZ`를 drizzle 전용으로 따로 둘 수도 있지만 초기에는 rain 그룹에 흡수 가능하다.

#### D. Snow / Frozen precip

대상:

- `SN`
- `SG`
- `IC`
- `PL`

표준 키:

- `snow-day`
- `snow-night`

`PL`, `IC`는 별도 자산이 애매하면 초기에는 snow 그룹으로 흡수한다.

#### E. Freezing

대상:

- `FZRA`
- `FZDZ`
- `FZFG`

표준 키:

- `freezing-rain`
- `freezing-fog`

초기에는 자산 수를 줄이기 위해 둘 다 `freezing-rain` 또는 `fog` 기반으로 단순화할 수 있다.

#### F. Hail / Ice pellets

대상:

- `GR`
- `GS`
- 일부 `SHGR`, `SHGS`, `TSGR`, `TSGS`

표준 키:

- `hail`

#### G. Fog / Mist

대상:

- `FG`
- `MIFG`
- `BCFG`
- `PRFG`
- `BR`

표준 키:

- `fog-day`
- `fog-night`

초기에는 `BR`도 fog 그룹에 포함한다.

#### H. Haze / Smoke / Dust / Sand / Volcanic ash

대상:

- `HZ`
- `FU`
- `DU`
- `SA`
- `VA`

표준 키:

- `haze-day`
- `haze-night`
- 필요 시 `dust`

초기 버전에서는 haze 그룹 하나로 시작하고, `DU/SA/VA`는 이후 분리 가능하다.

#### I. Severe wind / vortex / squall / storm

대상:

- `PO`
- `SQ`
- `FC`
- `SS`
- `DS`
- `BLSN`
- `BLSA`
- `BLDU`
- `DRSN`
- `DRSA`
- `DRDU`

표준 키:

- `severe-wind`
- 필요 시 `blowing-snow`
- 필요 시 `dust-storm`

초기 버전에서는 하나의 severe-wind 그룹으로 시작하는 것이 현실적이다.

## 8. 구름 fallback 규칙

기상현상이 없을 때만 구름량으로 아이콘을 정한다.

매핑:

- `SKC`, `CLR`, `CAVOK` -> `clear-day` / `clear-night`
- `FEW` -> `few-clouds-day` / `few-clouds-night`
- `SCT` -> `scattered-clouds-day` / `scattered-clouds-night`
- `BKN` -> `broken-clouds`
- `OVC` -> `overcast`

선정 기준:

- 구름층이 여러 개면 가장 많은 amount를 대표로 사용한다.
- 기존 `resolveIconKey()`의 cloud priority 개념을 유지한다.

## 9. 최소 도입 범위

처음부터 모든 세부 현상을 완벽하게 커버하지 않는다.

### 9.1 1차 도입 대상

아래만 우선 안정적으로 지원한다.

- `clear-day`
- `clear-night`
- `few-clouds-day`
- `few-clouds-night`
- `scattered-clouds-day`
- `scattered-clouds-night`
- `broken-clouds`
- `overcast`
- `rain-day`
- `rain-night`
- `snow-day`
- `snow-night`
- `showers-day`
- `showers-night`
- `thunderstorm-day`
- `thunderstorm-night`
- `fog-day`
- `fog-night`
- `haze-day`
- `haze-night`
- `freezing-rain`
- `hail`
- `severe-wind`
- `unknown`

이 정도면 현재 공항 METAR/TAF 화면에서 체감 품질이 크게 오른다.

### 9.2 2차 확장 대상

추후 필요 시 아래를 분리한다.

- drizzle
- sleet
- freezing-fog
- blowing-snow
- dust-storm
- volcanic-ash
- mixed-rain-snow

## 10. 아이콘 자산 저장 방식

권장 경로:

- `frontend/src/assets/weather-icons/basmilius/`

권장 보조 파일:

- `frontend/src/assets/weather-icons/basmilius/LICENSE.txt`
- `frontend/src/utils/weather-icon-registry.js`
- `frontend/src/utils/weather-visual-resolver.js`

원본 공급처 파일명을 그대로 UI 코드에서 참조하지 않는다.

즉 실제 파일 구조는 다음처럼 간다.

```text
frontend/src/assets/weather-icons/basmilius/
  clear-day.svg
  clear-night.svg
  few-clouds-day.svg
  few-clouds-night.svg
  scattered-clouds-day.svg
  scattered-clouds-night.svg
  broken-clouds.svg
  overcast.svg
  rain-day.svg
  rain-night.svg
  snow-day.svg
  snow-night.svg
  showers-day.svg
  showers-night.svg
  thunderstorm-day.svg
  thunderstorm-night.svg
  fog-day.svg
  fog-night.svg
  haze-day.svg
  haze-night.svg
  freezing-rain.svg
  hail.svg
  severe-wind.svg
  unknown.svg
  LICENSE.txt
```

중요:

- 여기서 파일명은 "우리 프로젝트 표준 파일명"이다.
- 필요하면 원본 Basmilius 파일을 복사한 뒤 이름을 이 규칙에 맞게 다시 붙인다.

## 11. import 방식

권장 방식은 정적 import registry 방식이다.

이유:

- Vite 빌드가 자산 누락을 조기에 잡아준다.
- 코드 탐색이 쉽다.
- fallback 제어가 단순하다.
- 런타임 문자열 경로 조합보다 안정적이다.

예상 구조:

```js
import clearDay from "../assets/weather-icons/basmilius/clear-day.svg";
import clearNight from "../assets/weather-icons/basmilius/clear-night.svg";
import rainDay from "../assets/weather-icons/basmilius/rain-day.svg";
import rainNight from "../assets/weather-icons/basmilius/rain-night.svg";

export const WEATHER_ICON_REGISTRY = {
  "clear-day": clearDay,
  "clear-night": clearNight,
  "rain-day": rainDay,
  "rain-night": rainNight
};
```

이후 `WeatherIcon`은 아래처럼 단순화한다.

```text
iconId -> registry lookup -> <img src={...} />
```

강도 오버레이는 이미지 파일 추가 분기 대신 컴포넌트 렌더링 단계에서 얹는다.

예상 구조:

```text
resolveWeatherVisual(...)
  -> { iconId, intensityOverlay }
  -> WeatherIcon
  -> base SVG + overlay badge
```

## 12. 모듈 책임 분리

### 12.1 `weather-visual-resolver.js`

역할:

- `weather`, `clouds`, `cavok`, `time`를 입력받는다.
- 대표 `iconId`를 반환한다.
- 강도 오버레이를 함께 반환한다.
- 필요 시 raw code, source reason도 함께 반환할 수 있다.

예상 반환값:

```js
{
  iconId: "rain-night",
  intensityOverlay: "light",
  source: "weather",
  code: "RA",
  isDay: false
}
```

### 12.2 `weather-icon-registry.js`

역할:

- `iconId`와 실제 SVG import를 매핑한다.
- 누락 시 `unknown`으로 fallback 한다.

### 12.3 `WeatherIcon.jsx`

역할:

- `iconId` 또는 resolver 결과를 받아 `<img>`를 렌더링한다.
- `intensityOverlay`를 받아 작은 배지 또는 텍스트 오버레이를 렌더링한다.
- UI 크기, alt, className만 담당한다.
- 기상 판정 로직은 담지 않는다.

## 13. 단계별 구현 순서

### 1단계. 설계 문서 확정

- 본 문서를 기준으로 최소 `iconId` 목록을 확정한다.
- 1차 도입 범위를 확정한다.

### 2단계. 자산 수집

- Basmilius 아이콘 중 필요한 SVG만 선별한다.
- 프로젝트 표준 파일명으로 복사한다.
- 라이선스 파일을 함께 보관한다.

### 3단계. registry 도입

- `weather-icon-registry.js` 추가
- `WeatherIcon.jsx`를 이미지 기반 렌더링으로 교체
- 오버레이 렌더링 구조를 함께 도입

### 4단계. resolver 도입

- 기존 `resolveIconKey()`를 대체하거나 내부에서 새 resolver를 사용하도록 변경
- METAR/TAF 공통 사용 경로로 맞춘다
- intensity -> overlay 매핑을 함께 연결한다

### 5단계. 화면 적용

- `MetarCard.jsx`
- `TafTimeline.jsx`
- 필요 시 다른 날씨 아이콘 사용 지점

### 6단계. 검증

- 맑음, 구름, 비, 눈, 뇌우, 안개, CAVOK 케이스 확인
- 주간/야간 전환 확인
- `-RA`, `+RA`, `VCSH` 같은 강도/인접현상 오버레이 확인
- 파일 누락 시 `unknown` fallback 확인
- 프런트 빌드 확인

## 14. 구현 시 주의사항

- Basmilius 원본 파일명에 직접 의존하지 않는다.
- `public/` 문자열 경로보다 `src/assets` 정적 import를 우선한다.
- 강도(`LIGHT`, `HEAVY`, `VICINITY`)는 파일 분기 조건이 아니라 오버레이로 처리한다.
- `BR`, `FG`, `HZ`처럼 시각적으로 유사한 현상은 초기에 통합한다.
- `TSRA + BR` 같은 복합 현상은 대표 아이콘 1개만 노출한다.
- fallback은 항상 deterministic 해야 한다.

## 15. 권장 초기 매핑안

실제 1차 구현에서는 아래 정도로 시작하는 것이 가장 안정적이다.

| METAR 그룹 | 초기 iconId |
|---|---|
| `TS*` | `thunderstorm-day/night` |
| `SHRA` | `showers-day/night` |
| `SHSN` | `snow-day/night` 또는 `snow-showers-day/night` |
| `RA`, `DZ`, `UP` | `rain-day/night` |
| `SN`, `SG`, `IC`, `PL` | `snow-day/night` |
| `GR`, `GS` | `hail` |
| `FZRA`, `FZDZ` | `freezing-rain` |
| `FG`, `MIFG`, `BCFG`, `PRFG`, `BR` | `fog-day/night` |
| `HZ`, `FU`, `DU`, `SA`, `VA` | `haze-day/night` |
| `PO`, `SQ`, `FC`, `SS`, `DS`, `BL*`, `DR*` | `severe-wind` |
| `FEW` | `few-clouds-day/night` |
| `SCT` | `scattered-clouds-day/night` |
| `BKN` | `broken-clouds` |
| `OVC` | `overcast` |
| `CAVOK`, `SKC`, `CLR` | `clear-day/night` |

강도 오버레이 초기 정책:

| 강도 | overlay |
|---|---|
| `LIGHT` | `light` |
| `MODERATE` | 없음 |
| `HEAVY` | `heavy` |
| `VICINITY` | `vicinity` |

## 16. 결론

이번 아이콘 교체는 단순히 이미지 파일을 바꾸는 작업이 아니라, "기상코드 -> 표준 시각 상태 -> 실제 자산"의 3단계 구조를 만드는 작업이다.

권장 결론은 다음과 같다.

- Basmilius SVG를 프로젝트 내부 자산으로 vendoring 한다.
- 프로젝트 표준 `iconId`를 별도로 정의한다.
- 강도는 별도 아이콘 파일이 아니라 오버레이로 처리한다.
- `weather-visual-resolver`와 `weather-icon-registry`를 분리한다.
- 1차 구현은 20개 안팎의 대표 시각 상태만 안정적으로 지원한다.
- 세부 METAR 코드 분리는 이후 확장 단계에서 다룬다.

이 기준이면 현재 이모지 기반 임시 구현을 무리 없이 교체하면서도, 이후 아이콘 교체나 상세 매핑 확장에 대응하기 쉽다.

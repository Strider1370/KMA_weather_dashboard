# SIGWX_LOW Design

## 1. 목적

이 문서는 현재 프로젝트의 `SIGWX_LOW` 데이터 구조, 파싱 방식, 프론트 렌더링 규칙, 최근 시각화 변경 사항을 정리한 설계 메모이다.

특히 다음 내용을 빠르게 파악할 수 있도록 정리한다.

- KMA `SIGWX_LOW` XML이 어떤 JSON으로 변환되는지
- 프론트에서 어떤 기준으로 path / marker / tooltip / history를 렌더링하는지
- 전선을 왜 별도 이미지로 렌더링하게 되었는지
- 최근 작업으로 어떤 룰이 추가되었는지

---

## 2. 데이터 소스와 백엔드 흐름

### 2.1 소스

- API: KMA `amo_sigwx.php`
- 백엔드 수집기: `backend/src/processors/sigwx-low-processor.js`
- 파서: `backend/src/parsers/sigwx-low-parser.js`
- 저장 위치: `backend/data/sigwx_low/`

### 2.2 수집 주기

- 스케줄: `5 5,11,17,23 * * *`
- 실제 발효 기준값은 `tmfc` 사용
- 프로세서는 최신 가능 cycle을 우선 시도하고 fallback cycle을 순차 탐색한다

### 2.3 저장 방식

`SIGWX_LOW`는 일반 snapshot 규칙을 따른다.

- 최신본: `backend/data/sigwx_low/latest.json`
- 이력본: `backend/data/sigwx_low/SIGWX_LOW_<timestamp>.json`

각 snapshot은 최소한 다음 구조를 가진다.

```json
{
  "type": "sigwx_low",
  "fetched_at": "...",
  "tmfc": "2026040311",
  "source": {
    "mode": "LOW",
    "map_range_mode": "normal",
    "fpv_safe_bound_width": 677.34,
    "fpv_safe_bound_height": 667.39
  },
  "items": [ ... ]
}
```

---

## 3. XML -> JSON 파싱 구조

### 3.1 파서가 읽는 핵심 필드

`backend/src/parsers/sigwx-low-parser.js`는 XML item의 속성을 거의 그대로 JSON으로 내린다.

주요 필드:

- `item_type`
- `contour_name`
- `item_name`
- `label`
- `icon_name`
- `icon_tokens`
- `line_width`
- `curve_tension`
- `line_type`
- `shape_type`
- `color_line`
- `color_back`
- `label_pos_pt`
- `label_pos_offset_x`
- `label_pos_offset_y`
- `points`
- `fpv_points`
- `lat_lngs`
- `text_label`

### 3.2 좌표 처리

- XML 내부 `fpv_points`는 화면 좌표계 기반 값이다
- 파서는 `map_range_mode`, `fpv_safe_bound_width`, `fpv_safe_bound_height`를 이용해 이를 위경도로 변환한다
- 변환 결과가 `lat_lngs`
- 프론트는 주로 `lat_lngs`를 사용한다

### 3.3 중요한 점

파서는 의미 해석을 거의 하지 않는다.

- `item_type`의 의미를 해석하지 않음
- 화살표 방향을 별도 필드로 만들지 않음
- 전선을 special case로 바꾸지 않음

즉 `SIGWX_LOW` 의미 해석의 대부분은 프론트에서 이루어진다.

---

## 4. 프론트 기본 렌더 구조

### 4.1 주요 파일

- 지도 렌더: `frontend/src/components/InteractiveMap.jsx`
- SIGWX 유틸: `frontend/src/utils/sigwx.js`
- 데이터 로드: `frontend/src/utils/api.js`

### 4.2 데이터 입력

`InteractiveMap`은 다음 prop을 받는다.

- `sigwxLowData`
- `sigwxLowHistoryData`
- `sigwxLowFrontsData`

### 4.3 history 선택

현재는 latest + history를 합쳐서 `sigwxHistoryEntries`를 만든다.

- 최신 snapshot이 history 첫 항목과 다르면 latest를 맨 앞에 추가
- `sigwxHistoryIndex`로 현재 선택 frame 결정
- 선택 결과는 `selectedSigwxEntry`

이 정합 수정은 “처음엔 전선이 보이는데 과거 보고 다시 최신으로 오면 안 보이는 문제”를 해결하기 위해 추가되었다.

---

## 5. 현재 item_type / 역할 해석

공식 문서 기준보다는 **현재 레포에서의 실제 렌더 역할** 기준이다.

### 5.1 주요 item_type

- `type 4`
  - primary region / contour
  - 그룹의 루트가 되는 영역 item
- `type 7`
  - label/icon 계열 support item
  - 보통 marker 대상
- `type 8`
  - strong wind 숫자 박스 계열 support item
- `type 9`
  - 보조 선 / annotation / pointer / speed support item
- `type 10`
  - support annotation 계열
  - 일부는 속도 화살표, 일부는 freezing level 보조 라벨이라 일괄 처리하면 안 됨
- `type 11`
  - marker + path 혼합 성격 support item
- `type 12`
  - label/icon 계열 support item

### 5.2 주의

`type`만으로 의미를 확정하면 안 된다.

예:

- `type 10` 전체를 화살표로 처리하면 안 됨
- `freezing_level` 옆 `0℃:100`도 `type 10`인데 화살표가 아님

그래서 현재는 `item_type + contour_name + item_name + label`을 같이 보고 렌더 규칙을 나눈다.

---

## 6. 그룹화 규칙

`frontend/src/utils/sigwx.js`의 `buildSigwxGroups()`가 담당한다.

핵심 규칙:

- `item_type === 4`만 primary region으로 본다
- 나머지 child item은 primary region에 붙인다
- 부착 기준:
  - 우선 `contour_name + item_name`
  - 그다음 기하학적 포함/근접성

이 구조 때문에 화면의 `SIGWX_LOW N` 카운트는 item 수가 아니라 그룹 수에 가깝다.

---

## 7. marker / path / arrow 렌더 규칙

### 7.1 일반 path

`sigwxNeedsPath()` 기준으로 렌더한다.

현재 제외되는 것:

- `font_line` 전체
- `sfc_wind + wind_strong`
- `isSigwxArrowItem(item)`에 해당하는 annotation
- 기존 label-only 계열 일부

즉 전선과 화살표 annotation은 일반 polyline path와 분리됐다.

### 7.2 일반 marker

`sigwxNeedsLabelMarker()` 기준으로 렌더한다.

추가 special case:

- `freezing_level`
- `sfc_wind + wind_strong`

### 7.3 화살표 annotation

현재 `type 9/10` 전체가 아니라, 실제 화살표 역할인 객체만 별도 처리한다.

현재 화살표 판정(`isSigwxArrowItem`) 요약:

- 공통: `lat_lngs` 2점 이상
- 제외: `contour_name === "freezing_level"`
- 허용:
  - `type 9` + `contour_name`이 `cld`, `font_line`, `""`
  - `type 10` + `contour_name === ""`
  - `type 10` + `label`에 `km/h` 포함

렌더 방식:

- 2점 선분 그림
- 마지막 점 방향으로 화살촉 생성
- `label`이 있으면 끝점에 speed badge 표시

### 7.4 방향 정보 해석

현재 파서에는 별도 `angle`, `heading`, `direction` 필드가 없다.

따라서 화살표 방향은:

- `lat_lngs[0] -> lat_lngs[last]`

의 **점 순서**로 해석한다.

단, 의미는 객체 종류에 따라 다르다.

- 저기압/속도 항목: 이동 방향
- `cld` 포인터: 구름 영역을 가리키는 leader 방향

---

## 8. 아이콘 렌더링 규칙

### 8.1 아이콘 자산

경로: `frontend/public/icon_sigwx/`

현재 marker icon은 `icon_name` 기반으로 자산을 찾되, 일부는 special rule을 사용한다.

special icon 예:

- `freezing_level` -> `freezing_level.png`
- `sfc_wind + wind_strong` -> `box_wind.png`
- `pressure` -> `Hx.png`, `Lx.png` 등은 원본 `icon_name` 사용

### 8.2 현재 marker 스타일

최근 수정으로 다음 방식으로 바뀌었다.

- 아이콘 자체는 흰 배경 없이 지도 위에 직접 표시
- 기본 아이콘은 대략 2배 scale
- `freezing_level`은 더 작게 보이던 문제 때문에 3배 scale
- 텍스트가 필요한 경우에만 별도 흰색 chip 아래 표시

### 8.3 최근 텍스트 숨김 규칙

아이콘 아래 redundant text를 제거했다.

숨기는 대상:

- `freezing_level`의 `0℃:100`
- `sfc_vis`의 `rain`
- `sfc_vis`의 `fog`
- `sfc_vis`의 `widespread_fog`
- `sfc_vis`의 `widespread_mist`
- `sfc_vis`의 `widespread_fog/widespread_mist`
- `sfc_wind + wind_strong`의 중복 숫자

남기는 대상:

- `pressure`의 `999` 같은 실제 기압값
- `mountain_obscuration`의 산 이름
- 화살표 speed label (`15`, `40km/h`)

---

## 9. 전선(font_line) 렌더링 설계

### 9.1 배경

원래 `font_line`도 일반 GIS polyline으로 그렸다.

하지만 warm/cold/occluded front는 단순 선으로는 `sigwx2` 같은 차트 스타일과 거리가 멀었다.

초기에는 Leaflet 위에 전선 기호를 직접 붙이는 방식도 시험했지만, 시각 품질이 만족스럽지 않아 롤백했다.

### 9.2 현재 방식

현재는 **전선만 별도 이미지로 렌더링**한다.

핵심 파일:

- 생성기: `backend/src/parsers/sigwx-front-overlay.js`
- API: `server.js` `/api/sigwx-low-fronts`
- 프론트 표시: `InteractiveMap.jsx`의 `ImageOverlay`

### 9.3 동작 구조

1. `sigwx_low` snapshot에서 `font_line` (`fl_cold`, `fl_worm`, `fl_occl`) 추출
2. 백엔드에서 SVG로 전선만 렌더
3. 투명 PNG 생성
4. 메타 파일 생성
5. 프론트가 현재 선택 `tmfc`에 맞는 overlay를 로드

생성 파일 예:

- `backend/data/sigwx_low/fronts_meta_<tmfc>.json`
- `backend/data/sigwx_low/fronts_<tmfc>.png`

### 9.4 왜 이미지 렌더를 선택했는가

- GIS polyline만으로는 차트형 warm/cold/occluded front 기호 재현이 어려움
- 전선은 line + symbol + orientation + spacing이 모두 중요함
- 전선만 PNG overlay로 만들면:
  - 차트 유사도 확보 가능
  - 나머지 SIGWX marker/tooltip은 그대로 유지 가능

### 9.5 현재 전선 trial 상태

이미 다음 사항을 반영했다.

- cold / warm / occluded 분리 렌더
- 삼각형 / 반원 심볼 생성
- cold 삼각형 방향 수정
- occluded triangle 방향을 cold와 분리
- warm/occluded 반원 filled 처리
- 선을 직선 폴리라인이 아니라 곡선화
- 심볼 크기 확대
- 심볼 간격 감소(덜 촘촘하게)

### 9.6 현재 프론트 표시 규칙

- `font_line`은 더 이상 원래 GIS path로 그리지 않음
- 전선은 이미지 overlay만 표시

이 변경은 `frontend/src/utils/sigwx.js`의 `sigwxNeedsPath()`에서 `font_line`을 제외하는 방식으로 반영되었다.

### 9.7 history와의 정합

전선 overlay는 latest 고정이 아니고 `tmfc`별로 맞춰서 표시한다.

- 프론트가 현재 `selectedSigwxEntry.tmfc`를 기준으로 `/api/sigwx-low-fronts?tmfc=...` 요청
- 서버는 이미 저장 시점에 생성된 `fronts_meta_<tmfc>.json`을 읽어 반환
- 해당 시각에 `font_line`이 없으면 overlay도 없음

이 정합은 “과거 SIGWX를 볼 때 최신 전선이 남아 있는 문제”를 해결하기 위해 추가되었다.

---

## 10. CB / cloud 관련 현재 상태

CB는 별도 `CB item`이라기보다 cloud contour + multiline label 조합으로 나타난다.

예:

- `contour_name: "cld"`
- `item_name: "cloud"`
- `label: "ISOL\nEMBD\nCB\nXXX\n010"`

또한 `cld` 계열에는 `type 9` 포인터/leader line이 같이 붙을 수 있다.

즉 CB는 다음 두 레이어로 분리해서 본다.

- cloud area contour
- cloud/CB text annotation + pointer

현재 구현:

- `cld/cloud`의 CB boundary는 `backend/src/parsers/sigwx-cloud-overlay.js`가 갈색 scalloped overlay로 렌더
- 결과 파일은 `clouds_<tmfc>.png` + `clouds_meta_<tmfc>.json`
- 원래 `line_type 5` dashed GIS path는 숨김
- `ISOL / EMBD / CB / XXX / 010` 텍스트는 XML `rect_label` 우선으로 위치를 계산

---

## 11. 패널 토글 규칙

- `font_line`은 상세 패널에서 개별 토글로 직접 노출하지 않는다
- 대신 `pressure` + `font_line` 계열은 synthetic pressure-system 그룹으로 묶는다
- 이 그룹을 끄면 pressure icon/label, pressure speed arrow, front overlay가 함께 숨겨진다
- `CB` cloud 그룹을 끄면 cloud overlay도 함께 숨겨진다
- 같은 이름의 그룹이 여러 개면 패널에는 `SFC_VIS 1`, `SFC_VIS 2`처럼 번호를 붙여 표시한다

---

## 12. 현재 남은 과제

아직 추가로 다듬을 여지가 있는 항목:

- `type 9/10` 화살표의 현상별 모양 차등화
  - cloud pointer와 movement vector를 같은 화살표로 두지 않을 가능성 있음
- `CB` 전용 아이콘/annotation 정리
- pressure / mountain / speed label 위치 세밀 조정
- 전선 overlay bounds / symbol spacing / size 미세조정
- 필요 시 전선 말고도 다른 chart-like 요소를 image overlay로 뺄지 검토

---

## 13. 요약

현재 `SIGWX_LOW`는 다음 원칙으로 정리되어 있다.

- 원본 XML 의미는 최대한 JSON에 보존
- 의미 해석은 프론트에서 수행
- 일반 현상 아이콘은 public 자산을 적극 활용
- redundant text는 제거하고, 의미 있는 text만 유지
- `type`만으로 판단하지 않고 `contour_name`, `item_name`, `label`까지 함께 본다
- 전선(`font_line`)은 GIS line이 아니라 **별도 이미지 overlay**로 렌더한다
- CB cloud 경계도 GIS dashed line이 아니라 **별도 scalloped image overlay**로 렌더한다
- history 선택 시 전선/CB overlay도 `tmfc` 기준으로 같이 바뀐다

즉 현재 구조는 “가능한 것은 GIS marker/path로 처리하고, 차트형 정밀도가 필요한 전선은 별도 이미지로 렌더”하는 하이브리드 방식이다.

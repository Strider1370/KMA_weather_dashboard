# Airport Weather Forecast View 설계문서

## 개요

`/ground` 모드에서 지도패널 "예보" 탭을 통해 TAF 데이터를 시각적으로 표현하는 기능이다.
선택한 공항의 TAF 타임라인을 시간 슬라이더로 탐색하면서, 해당 시간대의 날씨 조건에 맞는 AI 생성 공항 전경 이미지를 보여준다.

## 구성 요소

### 1. AI 공항 날씨 이미지 생성

- **생성 도구**: Gemini API (`gemini-3.1-flash-image-preview` / Nano Banana 2)
- **스크립트**: `scripts/generate-airport-weather-images.js`
- **기준 이미지**: 각 공항별 전경 사진 1장 (예: `제주공항_기준.png`)
- **프롬프트 문서**: `AIRPORT_AI_IMAGE_PROMPTS.md`

#### 이미지 생성 방식

1. 기준 이미지를 base64로 인코딩하여 Gemini API에 전송
2. 공통 지침(구도/각도/렌즈 유지, 사실적 표현) + 장면별 프롬프트로 날씨만 변경 요청
3. 응답에서 base64 이미지를 추출하여 PNG로 저장
4. 요청 간 3초 간격 rate limiting 적용
5. 이미 존재하는 이미지는 skip

#### 이미지 조합 (30장)

시간대 3종 × 날씨 10종 = 30장

| 시간대 | 파일 접두사 |
|--------|------------|
| 골든아워(일출/일몰) | `golden_` |
| 낮 | `day_` |
| 밤 | `night_` |

| 날씨 | 파일 접미사 | TAF 코드 매핑 |
|------|------------|---------------|
| 맑음 | `clear` | SKC, FEW, NSW, CAVOK |
| 구름조금 | `sct` | SCT |
| 구름많음 | `bkn` | BKN |
| 흐림 | `ovc` | OVC |
| 안개 | `fog` | FG |
| 비 | `rain` | RA, DZ, SHRA, -RA, -DZ, -SHRA |
| 강한 비 | `heavy_rain` | +RA, +SHRA |
| 눈 | `snow` | SN, SHSN, -SN, -SHSN |
| 강한 눈 | `heavy_snow` | +SN, +SHSN |
| 뇌우 | `thunderstorm` | TS, TSRA, +TSRA |

#### 저장 경로

```
frontend/public/airport_weather/{ICAO}/{period}_{weather}.png
```

예: `frontend/public/airport_weather/RKPC/day_rain.png`

### 2. 예보 탭 UI (`TafForecastView`)

**파일**: `frontend/src/components/TafForecastView.jsx`

#### UI 구성

```
┌─────────────────────────────────────────────┐
│ [▶] 5일 06시 ┃████░░░░████████░░░░░┃ 6일 12시  │  ← 슬라이더
│              │ (playhead 수직선)     │          │
├─────────────────────────────────────────────┤
│ 5일 06시 ~ 12시  구름많음  바람 270/12 ...  │  ← TAF 정보
├─────────────────────────────────────────────┤
│                                             │
│            [공항 날씨 이미지]                  │  ← 크로스페이드
│                                             │
└─────────────────────────────────────────────┘
```

#### 슬라이더

- TAF 유효 기간 전체를 가로로 표현
- 같은 날씨 조건이 연속되는 구간을 하나의 세그먼트로 병합
- 세그먼트 색상: day(파랑), night(회색), golden(주황)
- 선택된 세그먼트에 accent 아웃라인 표시

#### 재생 기능

- 재생 버튼(▶/⏸)으로 시작/일시정지
- 재생 시 playhead(수직선)가 슬라이더를 왼→오 스윕 (40초)
- playhead가 세그먼트 경계를 넘으면 이미지 자동 전환
- 끝에 도달하면 처음부터 루프 반복
- 세그먼트 클릭 시 재생 중지 + playhead 이동

#### 이미지 전환

- 세그먼트 변경 시 1초 크로스페이드(fade-out + fade-in)
- 이전 이미지가 사라지면서 새 이미지가 나타나는 오버랩 전환
- fade-in 시 살짝 scale(1.01 → 1.0) 효과

### 3. TAF → 이미지 매핑 로직

#### 시간대 판별 (`getTimePeriod`)

KST 기준:
- 06시 ~ 18시: `day`
- 18시 ~ 06시: `night`

> golden 시간대 이미지는 생성되어 있으나, TAF 시간 단위(1시간)에서 golden hour(약 30분)를 구분하기 어려워 현재 미사용

#### 날씨 판별 (`resolveWeatherKey`)

`slot.display.weather` 문자열을 우선순위 순서로 체크:

1. `TS` 포함 → `thunderstorm`
2. `+SN` 또는 `+SHSN` → `heavy_snow`
3. `+RA` 또는 `+SHRA` → `heavy_rain`
4. `SN` 또는 `SHSN` → `snow`
5. `RA`, `DZ`, `SHRA` → `rain`
6. `FG` → `fog`

날씨 코드 없으면 `slot.clouds` 배열의 최대 운량으로 fallback:
- OVC → `ovc`, BKN → `bkn`, SCT → `sct`
- 그 외(SKC, FEW, CLR, CAVOK) → `clear`

### 4. `/ground` 지도패널 변경사항

#### 오버레이 버튼

| 버튼 | ops 모드 | ground 모드 |
|------|---------|------------|
| 강수에코 | ✅ | ✅ |
| 안개/위성 | 안개 | 위성 (라벨 변경) |
| 낙뢰 | ✅ | ✅ |
| 깜빡임 | ✅ | ✅ |
| SIGMET | ✅ | ❌ |
| AIRMET | ✅ | ❌ |
| SIGWX_LOW | ✅ | ❌ |
| TRAFFIC | ✅ | ✅ |

#### 지도 범위 탭

- ops: `전국` / `공항`
- ground: `전국` / `공항` / `예보`

"예보" 탭 선택 시 지도 대신 `TafForecastView`를 렌더링한다.

## 새 공항 이미지 추가 방법

1. 공항 전경 기준 사진을 준비
2. `scripts/generate-airport-weather-images.js`에서 `REFERENCE_IMAGE`와 `OUTPUT_DIR`의 ICAO 코드를 변경
3. `node scripts/generate-airport-weather-images.js` 실행
4. 30장 생성 완료 후 `frontend/public/airport_weather/{ICAO}/` 확인

## 파일 목록

| 파일 | 역할 |
|------|------|
| `AIRPORT_AI_IMAGE_PROMPTS.md` | 30개 장면 프롬프트 + TAF 매핑표 |
| `scripts/generate-airport-weather-images.js` | Gemini API 이미지 생성 스크립트 |
| `frontend/public/airport_weather/{ICAO}/*.png` | 생성된 이미지 에셋 |
| `frontend/src/components/TafForecastView.jsx` | 예보 뷰 컴포넌트 |
| `frontend/src/components/InteractiveMap.jsx` | 지도패널 (예보 탭 추가) |
| `frontend/src/App.css` | 예보 뷰 스타일 |

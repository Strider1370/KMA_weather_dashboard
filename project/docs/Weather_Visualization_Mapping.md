# 기상 시각화 매핑 설계문서

## 1. 개요

### 1.1 목적
TAF/METAR에서 파싱된 기상 데이터를 시각적 요소(아이콘, wind barb)로 매핑하는 규칙을 정의한다.

### 1.2 범위
- 기상현상(WeatherPhenomenon) → 아이콘 키 매핑
- 바람(WindData) → Wind Barb 매핑

### 1.3 데이터 소스
TAF 설계문서의 WeatherPhenomenon 객체 및 WindData 객체를 입력으로 받는다. TAF/METAR 공통 구조이므로 매핑 테이블은 하나로 통일된다.

---

## 2. 기상현상 아이콘 매핑

### 2.1 매핑 전략

WeatherPhenomenon은 강도(intensity) × 특성(descriptor) × 현상본체(phenomena)의 조합이지만, 현실적으로 TAF/METAR에 등장하는 조합은 제한적이다. 모든 이론적 조합이 아닌, **실제 사용되는 조합**을 기준으로 매핑한다.

### 2.2 아이콘 키 결정 규칙

매핑 키는 아래 우선순위로 결정한다:

```
1순위: descriptor (특성)가 있으면 특성이 아이콘의 기본 성격을 결정
       예: TS(뇌전) → 뇌전 계열 아이콘
           SH(소나기) → 소나기 계열 아이콘
           FZ(어는) → 어는 계열 아이콘

2순위: phenomena (현상본체)가 구체적 형태를 결정
       예: RA(비) vs SN(눈) vs GR(우박)

3순위: intensity (강도)가 강약 변형을 결정
       예: LIGHT/MODERATE/HEAVY → 아이콘 변형 또는 동일 아이콘 + 강도 표시
```

### 2.3 강도 처리 방식

강도별로 별도 아이콘을 만들면 아이콘 수가 3배로 늘어난다. 두 가지 방식이 가능하다:

```
방식 A: 강도별 별도 아이콘
  → light_rain, moderate_rain, heavy_rain (아이콘 수 ×3)

방식 B: 기본 아이콘 1개 + 강도 표시자 오버레이
  → rain 아이콘 + "-" 또는 "+" 텍스트/기호 오버레이 (아이콘 수 ×1)
```

본 설계에서는 **방식 B**를 기본으로 한다. 아이콘은 현상의 종류를 나타내고, 강도는 별도 표시로 처리한다. 단, 일부 현상(TS 등)은 강도에 따라 시각적 차이가 큰 경우 별도 아이콘을 허용한다.

### 2.4 마스터 매핑 테이블

#### 2.4.1 강수 현상

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `RA` | — | RA | RA, -RA, +RA | 비 |
| `DZ` | — | DZ | DZ, -DZ, +DZ | 이슬비 |
| `SN` | — | SN | SN, -SN, +SN | 눈 |
| `SG` | — | SG | SG, -SG | 쌀알눈 |
| `IC` | — | IC | IC | 빙정 |
| `PL` | — | PL | PL, -PL, +PL | 얼음싸라기 |
| `GR` | — | GR | GR, +GR | 우박 |
| `GS` | — | GS | GS, -GS | 작은 우박 |
| `UP` | — | UP | UP | 미확인 강수 |

#### 2.4.2 소나기성 강수 (descriptor: SH)

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `SHRA` | SH | RA | SHRA, -SHRA, +SHRA | 소나기 |
| `SHSN` | SH | SN | SHSN, -SHSN, +SHSN | 소낙눈 |
| `SHGR` | SH | GR | SHGR, +SHGR | 우박 소나기 |
| `SHGS` | SH | GS | SHGS, -SHGS | 작은 우박 소나기 |
| `SHRASN` | SH | RA+SN | SHRASN, -SHRASN | 비와 눈 소나기 |
| `SH` | SH | (없음) | VCSH | 부근 소나기 |

#### 2.4.3 뇌전 (descriptor: TS)

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `TS` | TS | (없음) | TS, VCTS | 뇌전 (강수 없음) |
| `TSRA` | TS | RA | TSRA, -TSRA, +TSRA | 뇌우 (비) |
| `TSSN` | TS | SN | TSSN, +TSSN | 뇌전 + 눈 |
| `TSGR` | TS | GR | TSGR, +TSGR | 뇌전 + 우박 |
| `TSGS` | TS | GS | TSGS | 뇌전 + 작은 우박 |
| `TSRASN` | TS | RA+SN | +TSRASN | 뇌전 + 비눈 |
| `TSSNGR` | TS | SN+GR | +TSSNGR | 뇌전 + 눈 + 우박 |

#### 2.4.4 어는 현상 (descriptor: FZ)

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `FZRA` | FZ | RA | FZRA, -FZRA, +FZRA | 어는 비 |
| `FZDZ` | FZ | DZ | FZDZ, -FZDZ | 어는 이슬비 |
| `FZFG` | FZ | FG | FZFG | 어는 안개 |

#### 2.4.5 날림 현상 (descriptor: BL, DR)

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `BLSN` | BL | SN | BLSN | 높은 눈날림 |
| `BLSA` | BL | SA | BLSA | 높은 모래날림 |
| `BLDU` | BL | DU | BLDU | 높은 먼지날림 |
| `DRSN` | DR | SN | DRSN | 낮은 눈날림 |
| `DRSA` | DR | SA | DRSA | 낮은 모래날림 |
| `DRDU` | DR | DU | DRDU | 낮은 먼지날림 |

#### 2.4.6 안개/시정장애 현상

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `FG` | — | FG | FG | 안개 |
| `MIFG` | MI | FG | MIFG | 얕은 안개 |
| `BCFG` | BC | FG | BCFG | 부분 안개 |
| `PRFG` | PR | FG | PRFG | 부분적으로 덮인 안개 |
| `BR` | — | BR | BR | 박무 |
| `HZ` | — | HZ | HZ | 연무 |
| `FU` | — | FU | FU | 연기 |
| `VA` | — | VA | VA | 화산재 |
| `DU` | — | DU | DU | 널리 퍼진 먼지 |
| `SA` | — | SA | SA | 모래 |

#### 2.4.7 기타 현상

| 아이콘 키 | descriptor | phenomena | 대응 코드 예시 | 설명 |
|-----------|-----------|-----------|---------------|------|
| `PO` | — | PO | PO | 먼지/모래 회오리 |
| `SQ` | — | SQ | SQ | 스콜 |
| `FC` | — | FC | FC, +FC | 깔때기구름/토네이도 |
| `SS` | — | SS | SS, +SS | 모래폭풍 |
| `DS` | — | DS | DS, +DS | 먼지폭풍 |

#### 2.4.8 특수 상태

| 아이콘 키 | 조건 | 설명 |
|-----------|------|------|
| `CAVOK` | cavok_flag == true | 맑음/양호 |
| `NSW` | wx == [] (CAVOK 아닌 경우) | 중요 현상 없음 |

### 2.5 아이콘 키 결정 알고리즘

WeatherPhenomenon 객체에서 아이콘 키를 산출하는 알고리즘:

```
함수 resolve_icon_key(wp: WeatherPhenomenon) → String:

    // 1. descriptor + phenomena 조합으로 매핑 테이블 조회
    if wp.descriptor ≠ null:
        // descriptor가 있는 경우: descriptor + phenomena 결합
        key = wp.descriptor + join(wp.phenomena)
        // 예: descriptor=TS, phenomena=[RA] → "TSRA"
        // 예: descriptor=SH, phenomena=[SN] → "SHSN"
        // 예: descriptor=FZ, phenomena=[DZ] → "FZDZ"
        // 예: descriptor=TS, phenomena=[SN,GR] → "TSSNGR"
        
        if key가 매핑 테이블에 존재:
            return key
        
        // 매핑 테이블에 없는 조합: descriptor만 반환
        // 예: 예상치 못한 조합
        return wp.descriptor
    
    else:
        // descriptor가 없는 경우: phenomena 첫 번째 요소
        if wp.phenomena 비어있지 않음:
            return wp.phenomena[0]
            // 예: phenomena=[RA] → "RA"
            // 예: phenomena=[BR] → "BR"
            // 예: phenomena=[SN,RA] → "SN" (첫 번째 우선)
        
        // phenomena도 없음 (이론적으로 발생하지 않음)
        return "UNKNOWN"
```

### 2.6 복수 기상현상 처리

한 시각에 여러 기상현상이 있는 경우:

```
예: wx = [{ raw: "+TSRA" }, { raw: "BR" }]
  → 아이콘 키: ["TSRA", "BR"]
  → 표시: 아이콘 2개 나열 또는 우선순위 높은 것 1개만 표시
```

**우선순위 규칙 (위험도 기준)**:

```
1순위: TS 계열 (뇌전)
2순위: FZ 계열 (어는 현상)
3순위: SH 계열 (소나기성)
4순위: 강수 (RA, SN, PL, GR 등)
5순위: 시정장애 (FG, BR, HZ 등)
6순위: 기타 (PO, SQ 등)
```

단일 아이콘만 표시해야 하는 경우 가장 높은 우선순위의 현상을 선택한다.

### 2.7 VICINITY (VC) 처리

VC는 비행장 부근(8~16km)에서 관측된 현상이다.

```
아이콘 키 결정: VC를 제외하고 동일한 규칙 적용
  VCSH → 아이콘 키: "SH"
  VCTS → 아이콘 키: "TS"
  VCFG → 아이콘 키: "FG"

표시 시 VC 여부를 별도로 표기:
  - 아이콘 투명도 조절 (반투명)
  - 아이콘 테두리 점선 처리
  - "VC" 텍스트 오버레이
  등 구현 시 결정
```

### 2.8 필요 아이콘 목록 (총계)

아이콘 파일을 준비할 때 필요한 전체 목록이다.

#### 강수 계열 (9개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 1 | RA | 비 |
| 2 | DZ | 이슬비 |
| 3 | SN | 눈 |
| 4 | SG | 쌀알눈 |
| 5 | IC | 빙정 |
| 6 | PL | 얼음싸라기 |
| 7 | GR | 우박 |
| 8 | GS | 작은 우박 |
| 9 | UP | 미확인 강수 |

#### 소나기 계열 (6개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 10 | SHRA | 소나기 |
| 11 | SHSN | 소낙눈 |
| 12 | SHGR | 우박 소나기 |
| 13 | SHGS | 작은 우박 소나기 |
| 14 | SHRASN | 비눈 소나기 |
| 15 | SH | 소나기 (VC용) |

#### 뇌전 계열 (7개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 16 | TS | 뇌전 |
| 17 | TSRA | 뇌우 (비) |
| 18 | TSSN | 뇌전 + 눈 |
| 19 | TSGR | 뇌전 + 우박 |
| 20 | TSGS | 뇌전 + 작은 우박 |
| 21 | TSRASN | 뇌전 + 비눈 |
| 22 | TSSNGR | 뇌전 + 눈우박 |

#### 어는 계열 (3개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 23 | FZRA | 어는 비 |
| 24 | FZDZ | 어는 이슬비 |
| 25 | FZFG | 어는 안개 |

#### 날림 계열 (6개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 26 | BLSN | 높은 눈날림 |
| 27 | BLSA | 높은 모래날림 |
| 28 | BLDU | 높은 먼지날림 |
| 29 | DRSN | 낮은 눈날림 |
| 30 | DRSA | 낮은 모래날림 |
| 31 | DRDU | 낮은 먼지날림 |

#### 시정장애 계열 (10개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 32 | FG | 안개 |
| 33 | MIFG | 얕은 안개 |
| 34 | BCFG | 부분 안개 |
| 35 | PRFG | 부분적 안개 |
| 36 | BR | 박무 |
| 37 | HZ | 연무 |
| 38 | FU | 연기 |
| 39 | VA | 화산재 |
| 40 | DU | 먼지 |
| 41 | SA | 모래 |

#### 기타 계열 (5개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 42 | PO | 먼지/모래 회오리 |
| 43 | SQ | 스콜 |
| 44 | FC | 깔때기구름/토네이도 |
| 45 | SS | 모래폭풍 |
| 46 | DS | 먼지폭풍 |

#### 특수 상태 (2개)

| # | 아이콘 키 | 설명 |
|---|-----------|------|
| 47 | CAVOK | 양호 |
| 48 | NSW | 중요 현상 없음 |

**총 48개 아이콘 키**

### 2.9 아이콘 파일명 규칙

```
wx_{아이콘키}.{확장자}

예시:
  wx_RA.svg
  wx_TSRA.svg
  wx_FZDZ.svg
  wx_CAVOK.svg
  wx_BR.svg
```

### 2.10 JSON 출력과의 연계

기존 JSON의 weather 배열에 아이콘 키를 추가한다:

```json
{
  "weather": [
    {
      "raw": "-SHSN",
      "intensity": "LIGHT",
      "descriptor": "SH",
      "phenomena": ["SN"],
      "icon_key": "SHSN"
    }
  ]
}
```

display 객체에도 대표 아이콘 키를 추가한다:

```json
{
  "display": {
    "weather_icon": "SHSN",
    "weather_intensity": "LIGHT"
  }
}
```

---

## 3. Wind Barb 매핑

### 3.1 Wind Barb 기본 개념

Wind barb는 풍향과 풍속을 하나의 기호로 표현한다.

```
구성 요소:
  - 축(staff): 풍향을 나타내는 직선, 바람이 불어오는 방향을 가리킴
  - 깃(barb): 축 끝에 붙는 선, 풍속을 나타냄
    - 긴 깃(long barb) = 10kt
    - 짧은 깃(short barb) = 5kt
    - 삼각 깃(pennant/flag) = 50kt
  - 원(circle): 정온(calm) 시 원만 표시
```

### 3.2 풍속 → 깃 구성 규칙

풍속을 5kt 단위로 반올림한 후, 아래 규칙으로 깃을 구성한다:

```
1. 50kt 이상: 삼각 깃으로 최대한 소비
2. 나머지에서 10kt: 긴 깃으로 소비
3. 나머지 5kt: 짧은 깃 1개

예시:
  풍속 → 반올림 → 삼각 + 긴깃 + 짧은깃
```

### 3.3 풍속 구간별 매핑 테이블

| 풍속 (kt) | 반올림 | 삼각 | 긴깃 | 짧은깃 | barb 키 | 시각 표현 |
|-----------|--------|------|------|--------|---------|----------|
| 0 (Calm) | 0 | 0 | 0 | 0 | `calm` | ○ (원) |
| 1~2 | 0 | 0 | 0 | 0 | `calm` | ○ |
| 3~7 | 5 | 0 | 0 | 1 | `5` | ─╲ |
| 8~12 | 10 | 0 | 1 | 0 | `10` | ─╲ |
| 13~17 | 15 | 0 | 1 | 1 | `15` | ─╲╲ |
| 18~22 | 20 | 0 | 2 | 0 | `20` | ─╲╲ |
| 23~27 | 25 | 0 | 2 | 1 | `25` | ─╲╲╲ |
| 28~32 | 30 | 0 | 3 | 0 | `30` | ─╲╲╲ |
| 33~37 | 35 | 0 | 3 | 1 | `35` | ─╲╲╲╲ |
| 38~42 | 40 | 0 | 4 | 0 | `40` | ─╲╲╲╲ |
| 43~47 | 45 | 0 | 4 | 1 | `45` | ─╲╲╲╲╲ |
| 48~52 | 50 | 1 | 0 | 0 | `50` | ─▶ |
| 53~57 | 55 | 1 | 0 | 1 | `55` | ─▶╲ |
| 58~62 | 60 | 1 | 1 | 0 | `60` | ─▶╲ |
| 63~67 | 65 | 1 | 1 | 1 | `65` | ─▶╲╲ |
| 68~72 | 70 | 1 | 2 | 0 | `70` | ─▶╲╲ |
| 73~77 | 75 | 1 | 2 | 1 | `75` | ─▶╲╲╲ |
| 78~82 | 80 | 1 | 3 | 0 | `80` | ─▶╲╲╲ |
| 83~87 | 85 | 1 | 3 | 1 | `85` | ─▶╲╲╲╲ |
| 88~92 | 90 | 1 | 4 | 0 | `90` | ─▶╲╲╲╲ |
| 93~97 | 95 | 1 | 4 | 1 | `95` | ─▶╲╲╲╲╲ |
| 98~102 | 100 | 2 | 0 | 0 | `100` | ─▶▶ |

### 3.4 풍향 처리

```
Wind barb의 축(staff)은 바람이 불어오는 방향을 가리킨다.
깃(barb)은 축의 왼쪽(북반구 기준)에 붙는다.

렌더링 시:
  1. 기본 barb 이미지: 북풍(360°/0°) 기준으로 생성 (축이 아래에서 위로)
  2. 풍향에 따라 회전: rotation = wind_direction (deg)
  
  예시:
    풍향 270° (서풍) → barb를 270° 회전
    풍향 180° (남풍) → barb를 180° 회전
```

### 3.5 Wind Barb 결정 알고리즘

```
함수 resolve_wind_barb(wind: WindData):

    // 1. 정온 판별
    if wind.speed == 0 OR wind.raw == "00000KT":
        return { barb_key: "calm", rotation: 0 }
    
    // 2. 풍속 반올림 (5kt 단위)
    rounded = round(wind.speed / 5) * 5
    
    // 3. 깃 구성
    remaining = rounded
    pennants = floor(remaining / 50)
    remaining = remaining - (pennants * 50)
    long_barbs = floor(remaining / 10)
    remaining = remaining - (long_barbs * 10)
    short_barbs = floor(remaining / 5)
    
    // 4. barb 키
    barb_key = str(rounded)
    
    // 5. 회전각
    rotation = wind.direction
    
    return {
        barb_key: barb_key,        // "5", "10", "15", ..., "100"
        rotation: rotation,         // 0~360
        pennants: pennants,         // 삼각 깃 수
        long_barbs: long_barbs,     // 긴 깃 수
        short_barbs: short_barbs,   // 짧은 깃 수
        speed: wind.speed,          // 원본 풍속
        gust: wind.gust             // 돌풍 (있으면)
    }
```

### 3.6 돌풍(Gust) 표시

Wind barb 표준에는 돌풍 표현이 없다. 돌풍이 있는 경우 별도 표시가 필요하다:

```
옵션 1: barb 옆에 "G25" 텍스트 표시
옵션 2: barb 색상 변경 (돌풍 있으면 빨간색 등)
옵션 3: barb는 평균 풍속, 돌풍은 별도 숫자로 표시

→ 구현 시 결정
```

### 3.7 VRB (Variable Wind) 처리

```
풍향이 VRB인 경우:
  barb 자체는 풍속에 따라 정상 구성
  회전각 없음 (방향 불정)

표시 방식:
  옵션 1: barb를 회전하지 않고 고정 표시 + "VRB" 텍스트
  옵션 2: 원형 화살표 아이콘
  
  → 구현 시 결정
```

### 3.8 Wind Barb 구현 방식

두 가지 방식이 가능하다:

```
방식 A: 사전 생성 이미지
  - barb_calm.svg, barb_5.svg, barb_10.svg, ..., barb_100.svg
  - 총 21개 이미지 준비
  - 렌더링 시 CSS transform: rotate({direction}deg) 적용
  - 장점: 단순, 빠름
  - 단점: 이미지 21개 관리

방식 B: 동적 생성
  - pennants, long_barbs, short_barbs 값으로 실시간 SVG/Canvas 렌더링
  - 장점: 이미지 파일 불필요
  - 단점: 렌더링 로직 구현 필요
```

### 3.9 JSON 출력과의 연계

기존 JSON의 wind 객체에 barb 정보를 추가한다:

```json
{
  "wind": {
    "raw": "32013G25KT",
    "direction": 320,
    "speed": 13,
    "gust": 25,
    "unit": "KT",
    "variable": false,
    "barb": {
      "barb_key": "15",
      "rotation": 320,
      "pennants": 0,
      "long_barbs": 1,
      "short_barbs": 1
    }
  }
}
```

---

## 4. 필요 리소스 총 목록

### 4.1 기상현상 아이콘 (48개)

파일명 패턴: `wx_{키}.{확장자}`

```
강수 (9):    wx_RA, wx_DZ, wx_SN, wx_SG, wx_IC, wx_PL, wx_GR, wx_GS, wx_UP
소나기 (6):  wx_SHRA, wx_SHSN, wx_SHGR, wx_SHGS, wx_SHRASN, wx_SH
뇌전 (7):   wx_TS, wx_TSRA, wx_TSSN, wx_TSGR, wx_TSGS, wx_TSRASN, wx_TSSNGR
어는 (3):   wx_FZRA, wx_FZDZ, wx_FZFG
날림 (6):   wx_BLSN, wx_BLSA, wx_BLDU, wx_DRSN, wx_DRSA, wx_DRDU
시정장애 (10): wx_FG, wx_MIFG, wx_BCFG, wx_PRFG, wx_BR, wx_HZ, wx_FU, wx_VA, wx_DU, wx_SA
기타 (5):   wx_PO, wx_SQ, wx_FC, wx_SS, wx_DS
특수 (2):   wx_CAVOK, wx_NSW
```

### 4.2 Wind Barb (방식 A 선택 시, 21개)

파일명 패턴: `barb_{키}.{확장자}`

```
barb_calm, barb_5, barb_10, barb_15, barb_20, barb_25,
barb_30, barb_35, barb_40, barb_45, barb_50, barb_55,
barb_60, barb_65, barb_70, barb_75, barb_80, barb_85,
barb_90, barb_95, barb_100
```

### 4.3 총계

| 분류 | 수량 |
|------|------|
| 기상현상 아이콘 | 48개 |
| Wind Barb (방식 A) | 21개 |
| **합계** | **69개** |

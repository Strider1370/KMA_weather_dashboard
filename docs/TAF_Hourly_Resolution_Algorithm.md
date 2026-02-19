# TAF 시간별 분해 알고리즘 설계문서

## 1. 개요

### 1.1 목적
TAF(Terminal Aerodrome Forecast) 전문을 입력받아, 유효기간 내 매 시각(1시간 간격)의 확정 기상 상태를 산출한다.

### 1.2 산출물 형태
각 시각에 대해 하나의 확정된 기상 상태(바람, 시정, 기상현상, 구름)를 출력한다. 해당 값의 출처(Base/BECMG/TEMPO/PROB)는 구분하지 않는다.

### 1.3 적용 범위 및 제약
- FM(From) 그룹은 처리 대상에서 **배제**한다.
- BECMG는 시작 시각에 **즉시 적용**(전환 구간 개념 없음)한다.
- TEMPO, PROB30, PROB40, PROB30 TEMPO, PROB40 TEMPO를 모두 처리한다.
- 기온(TX/TN)은 TAF 헤더 정보로 별도 표시한다.
- 윈드시어(WS)는 본 문서의 범위 밖이다.

---

## 2. 데이터 모델

### 2.1 기상현상 객체 (WeatherPhenomenon)

기상현상 하나를 구조적으로 표현하는 객체이다.

```
WeatherPhenomenon = {
    raw        : String,         // 원문 보존 (예: "+TSRA", "-FZDZ", "VCSH")
    intensity  : Enum { LIGHT, MODERATE, HEAVY, VICINITY } | null,
    descriptor : Enum { MI, BC, PR, DR, BL, SH, TS, FZ } | null,
    phenomena  : List[String]    // 현상 본체 2글자 코드 (예: ["RA"], ["SN","GR"])
}
```

**강도 (Intensity)**

| 원문 접두어 | 값 | 의미 |
|------------|-----|------|
| `-` | LIGHT | 약한 |
| (없음) | MODERATE | 보통 (기본값) |
| `+` | HEAVY | 강한 |
| `VC` | VICINITY | 비행장 부근 (8~16km) |

**특성 (Descriptor)**

| 코드 | 의미 |
|------|------|
| MI | 얕은 (Shallow) |
| BC | 부분적 (Patches) |
| PR | 부분적으로 덮인 (Partial) |
| DR | 낮은 날림 (Low drifting) |
| BL | 높은 날림 (Blowing) |
| SH | 소나기성 (Showers) |
| TS | 뇌전 (Thunderstorm) |
| FZ | 어는/과냉각 (Freezing) |

**현상 본체 (Phenomena)**

| 분류 | 코드 |
|------|------|
| 강수 | RA, DZ, SN, SG, IC, PL, GR, GS, UP |
| 시정장애 | FG, BR, HZ, FU, VA, DU, SA, PY |
| 기타 | PO, SQ, FC, SS, DS |

### 2.2 기상현상 파싱 규칙

원문 문자열을 왼쪽부터 순서대로 소비한다.

```
1단계: 강도 추출 (맨 앞)
  "-"  → LIGHT,    포인터 1칸 전진
  "+"  → HEAVY,    포인터 1칸 전진
  "VC" → VICINITY, 포인터 2칸 전진
  없음 → MODERATE

2단계: 특성 추출 (다음 2글자)
  {MI, BC, PR, DR, BL, SH, TS, FZ} 중 매칭 → 소비
  매칭 없음 → null

3단계: 현상 본체 추출 (나머지를 2글자씩 분할)
  유효 코드 목록과 매칭하여 리스트에 추가
```

**파싱 예시**

| 원문 | 강도 | 특성 | 현상 본체 |
|------|------|------|----------|
| `-RA` | LIGHT | null | [RA] |
| `+TSRA` | HEAVY | TS | [RA] |
| `TSRA` | MODERATE | TS | [RA] |
| `VCSH` | VICINITY | SH | [] |
| `-FZDZ` | LIGHT | FZ | [DZ] |
| `BLSN` | MODERATE | BL | [SN] |
| `PRFG` | MODERATE | PR | [FG] |
| `-SNRA` | LIGHT | null | [SN, RA] |
| `+TSSNGR` | HEAVY | TS | [SN, GR] |
| `BR` | MODERATE | null | [BR] |

### 2.3 기상 상태 (State)

매 시각에 대해 산출하는 단위 객체이다.

```
State = {
    wind    : String | null,                    // 예: "28015G25KT", "VRB03KT", "00000KT"
    vis     : String | null,                    // 예: "9999", "4000", "0800"
    wx      : List[WeatherPhenomenon] | null,   // 예: [{+TSRA}, {-DZ}], [] (현상 없음)
    clouds  : List[String] | null               // 예: ["SCT010", "BKN030"], [] (구름 없음)
}
```

**null과 빈 배열의 의미 구분 (핵심)**

| 값 | 의미 | touched 플래그 | partial_merge 동작 |
|----|------|---------------|-------------------|
| `null` | 이 그룹은 해당 요소에 대해 언급하지 않음 | `false` | 기존 값 유지 |
| `[]` (빈 배열) | 해당 요소가 없음을 명시적으로 선언 | `true` | 기존 값을 빈 배열로 대체 |
| `["BR"]` 등 | 해당 요소의 구체적 값 | `true` | 기존 값을 새 값으로 대체 |

이 구분은 NSW, NSC, CAVOK 처리의 정확성을 결정하는 가장 중요한 설계 원칙이다. 값 자체(`null` vs `[]`)에 더해, `wx_touched`/`clouds_touched` 플래그(2.4절 참조)를 통해 "언급 여부"를 명시적으로 보존하여 구현 시 falsy 판정 버그를 방지한다.

### 2.4 변화 그룹 (ChangeGroup)

```
ChangeGroup = {
    type            : Enum { BECMG, TEMPO, PROB30, PROB40, PROB30_TEMPO, PROB40_TEMPO },
    start           : DateTime,   // DDhh (UTC)
    end             : DateTime,   // DDhh (UTC)
    wind            : String | null,
    vis             : String | null,
    wx              : List[WeatherPhenomenon] | null,
    clouds          : List[String] | null,
    wx_touched      : Boolean,    // 원문/XML에 기상현상 관련 노드가 존재하면 true
    clouds_touched  : Boolean     // 원문/XML에 구름 관련 노드가 존재하면 true
}
```

**touched 플래그 규칙**

| 원문/XML 상태 | 값 | touched |
|--------------|-----|---------|
| 해당 노드 자체가 없음 | `null` | `false` |
| 노드가 있고, "없음 명시" (NSW/NSC) | `[]` | `true` |
| 노드가 있고, 값이 있음 | `[...]` | `true` |

이 플래그는 `partial_merge`에서 "이 변화 그룹이 해당 필드를 언급했는지"를 안전하게 판단하기 위해 존재한다. `null` vs `[]` 구분만으로는 대부분 언어에서 `[]`가 falsy로 평가되어 "없음 명시"가 누락되는 버그가 발생하기 쉽다.

> 참고: `wind`와 `vis`는 문자열이므로 `null` vs 값 구분이 명확하여 touched 플래그를 추가하지 않는다. 향후 필요 시 `wind_touched`, `vis_touched`를 추가할 수 있다.

### 2.5 기온 정보 (Temperature)

```
Temperature = {
    type  : Enum { TX, TN },   // TX=최고기온, TN=최저기온
    value : Integer,            // 온도 (°C), 음수 가능 (M 접두어 → 음수 변환)
    time  : DateTime            // 발생 예상 시각 (DDhhZ)
}
```

파싱 규칙:
- `TX25/0814Z` → { type: TX, value: 25, time: 08일14Z }
- `TNM03/0905Z` → { type: TN, value: -3, time: 09일05Z }
- `M` 접두어는 음수(Minus)를 의미하며, 파싱 시 부호를 반전한다.

### 2.6 TAF 객체

```
TAF = {
    icao        : String,              // 공항 코드
    issued      : DateTime,            // 발표 일시
    valid_start : DateTime,            // 유효기간 시작
    valid_end   : DateTime,            // 유효기간 종료
    temperatures: List[Temperature],   // 기온 정보 (TX, TN) — 헤더 표시용
    base        : State,               // 기본 예보
    changes     : List[ChangeGroup]    // 변화 그룹 목록 (시간순 정렬)
}
```

---

## 3. 정규화 (Normalization)

파싱 직후, 모든 State와 ChangeGroup에 대해 1회 실행한다. 정규화 이후에는 CAVOK, NSW, NSC라는 문자열이 내부 데이터에 존재하지 않아야 한다.

### 3.1 CAVOK 전개

CAVOK가 감지되면 3개 필드를 동시에 설정한다.

```
입력: CAVOK 플래그 감지
처리:
    vis    = "9999"
    wx     = []        (빈 배열: 현상 없음 명시)
    clouds = []        (빈 배열: 구름 없음 명시)
    cavok_flag = true  (표시용 플래그 보존)
```

### 3.2 NSW 전개

```
입력: wx 목록에 "NSW" 포함
처리:
    wx = []            (빈 배열: 현상 없음 명시)
```

### 3.3 NSC 전개

```
입력: clouds 목록에 "NSC" 포함
처리:
    clouds = []        (빈 배열: 구름 없음 명시)
    nsc_flag = true    (표시용 플래그 보존)
```

### 3.4 표시용 플래그

정규화 시 원본 코드를 별도 플래그로 보존한다.

| 원본 코드 | 내부 전개 | 표시용 플래그 | 최종 출력 |
|-----------|----------|-------------|----------|
| CAVOK | vis=9999, wx=[], clouds=[] | cavok_flag=true | "CAVOK" |
| NSC | clouds=[] | nsc_flag=true | "NSC" |
| NSW | wx=[] | 없음 | 후처리 규칙에 따름 |

---

## 4. NSW 후처리: 시정 연계 시정장애현상 자동 부여

NSW에 의해 기상현상이 소멸된 후(`wx = []`), 시정이 여전히 제한적이면 시정장애현상을 자동 부여한다.

### 4.1 규칙

| 시정 범위 | 자동 부여 현상 | 비고 |
|-----------|--------------|------|
| 1,000m ≤ vis < 5,000m | BR (박무) | 시정이 제한적이므로 시정장애현상 필요 |
| vis < 1,000m | 부여하지 않음 | FG는 TAF에서 명시적으로 기술됨 |
| vis ≥ 5,000m | 부여하지 않음 | 시정 양호 |

### 4.2 적용 시점

이 후처리는 **최종 상태 산출 후, 출력 직전**에 실행한다. 즉, partial_merge가 모두 완료된 최종 State에 대해 적용한다.

```
함수 resolve_wx_by_vis(state):
    if state.wx == [] AND state.cavok_flag != true:
        vis = 정수 변환(state.vis)
        if 1000 ≤ vis < 5000:
            state.wx = [WeatherPhenomenon{
                raw: "BR",
                intensity: MODERATE,
                descriptor: null,
                phenomena: ["BR"]
            }]
    return state
```

주의: CAVOK 상태에서는 시정이 9999이므로 이 규칙에 해당하지 않지만, 안전을 위해 cavok_flag 검사를 포함한다.

---

## 5. 핵심 연산: partial_merge

변화 그룹의 요소를 현재 상태에 병합하는 연산이다. 모든 변화 그룹(BECMG, TEMPO, PROB 등)이 이 연산을 공유한다.

```
함수 partial_merge(current_state, change_group):
    new_state = current_state의 깊은 복사

    // ── 바람, 시정: null 체크로 충분 (문자열이므로 falsy 문제 없음) ──
    if change_group.wind ≠ null:
        new_state.wind = change_group.wind

    if change_group.vis ≠ null:
        new_state.vis = change_group.vis

    // ── 기상현상, 구름: touched 플래그 기반 ──
    if change_group.wx_touched == true:
        new_state.wx = change_group.wx       // []도 그대로 덮어씀 (NSW)
    // wx_touched == false → 기존값 유지, 절대 변경하지 않음

    if change_group.clouds_touched == true:
        new_state.clouds = change_group.clouds  // []도 그대로 덮어씀 (NSC)
    // clouds_touched == false → 기존값 유지, 절대 변경하지 않음

    // ── 표시용 플래그 전파: touched 기반으로 해제 판단 ──
    if change_group.cavok_flag == true:
        new_state.cavok_flag = true
        new_state.nsc_flag = false           // CAVOK가 NSC를 흡수

    else if change_group.clouds_touched == true:
        // 구름을 명시적으로 언급했으므로 CAVOK 해제
        new_state.cavok_flag = false
        if change_group.nsc_flag == true:
            new_state.nsc_flag = true
        else:
            new_state.nsc_flag = false
    
    // clouds_touched == false → CAVOK/NSC 플래그 변경하지 않음

    return new_state
```

### 5.1 핵심 원칙

| 규칙 | 설명 |
|------|------|
| `touched == false` → **절대 변경 금지** | 해당 필드를 원문에서 언급하지 않았으므로 기존값 보존 |
| `touched == true`, `값 == []` → **덮어씀** | "없음 명시"(NSW/NSC)도 정상 반영 |
| `touched == true`, `값 == [...]` → **덮어씀** | 일반적인 값 변경 |
| `clouds_touched == false` → **CAVOK/NSC 해제 금지** | 바람만 바뀐 BECMG에서 CAVOK가 유지됨 |

### 5.2 수용 기준 테스트 케이스

**케이스 1: NSC가 실제로 반영돼야 함**

```
Base: clouds=[SCT020]
BECMG: clouds=[], clouds_touched=true, nsc_flag=true

결과: clouds=[], nsc_flag=true  ✅
실패 조건: SCT020이 남아있으면 실패
```

**케이스 2: 바람만 바뀌면 CAVOK 유지**

```
Base: cavok_flag=true, vis=9999, wx=[], clouds=[]
BECMG: wind=12010KT, clouds_touched=false, wx_touched=false

결과: cavok_flag=true 유지  ✅
실패 조건: cavok_flag가 false로 바뀌면 실패
```

**케이스 3: TEMPO가 구름을 명시하면 NSC는 무효**

```
Base: clouds=[], nsc_flag=true
TEMPO: clouds=[BKN020], clouds_touched=true

결과: clouds=[BKN020], nsc_flag=false  ✅
실패 조건: nsc_flag가 true로 남거나, BKN020이 반영 안 되면 실패
```

**구름과 기상현상의 그룹 전체 대체 원칙**: wx와 clouds는 개별 항목을 추가/제거하는 것이 아니라, `touched == true`인 경우 **전체를 새 값으로 교체**한다.

---

## 6. 메인 알고리즘

### 6.1 전체 흐름

```
함수 resolve_taf_hourly(taf):

    // 0단계: 정규화
    taf.base를 정규화
    taf.changes 각각을 정규화

    // 1단계: 변화 그룹 분류
    becmg_list = taf.changes에서 type == BECMG인 것 (시간순)
    tempo_list = taf.changes에서 type ∈ {TEMPO, PROB30, PROB40, PROB30_TEMPO, PROB40_TEMPO}인 것 (시간순)

    // 2단계: 시간 순회
    timeline = []
    for t = taf.valid_start to taf.valid_end (1시간 간격):

        // 2-1: Base State에서 시작
        state = taf.base의 깊은 복사

        // 2-2: BECMG 누적 적용 (즉시 적용 방식)
        for each becmg in becmg_list:
            if t >= becmg.start:
                state = partial_merge(state, becmg)

        // 2-3: TEMPO/PROB 오버라이드 적용
        for each tempo in tempo_list:
            if tempo.start ≤ t < tempo.end:
                state = partial_merge(state, tempo)

        // 2-4: NSW 후처리
        state = resolve_wx_by_vis(state)

        // 2-5: 출력
        timeline에 { time: t, state: state } 추가

    return timeline
```

### 6.2 BECMG 처리 상세

- BECMG의 start 시각 이후 모든 시각에서 해당 변경이 반영된다.
- 여러 BECMG가 있을 경우 시간순으로 누적 적용한다.
- BECMG는 **영구적**이다. 한번 적용되면 이후 모든 시각에 영향을 미친다.

```
예시:
  Base: wind=28015KT, vis=9999
  BECMG 0803: vis=4000, wx=[BR]
  BECMG 0808: vis=9999, wx=[]  (NSW 전개 결과)

  시각 0802: wind=28015KT, vis=9999, wx=없음     (Base만)
  시각 0803: wind=28015KT, vis=4000, wx=BR       (BECMG①)
  시각 0807: wind=28015KT, vis=4000, wx=BR       (BECMG① 유지)
  시각 0808: wind=28015KT, vis=9999, wx=없음     (BECMG①+②)
```

### 6.3 TEMPO/PROB 처리 상세

- TEMPO/PROB는 `start ≤ t < end` 구간에서만 적용된다.
- 구간 밖에서는 적용되지 않으며, 기본 상태(Base + BECMG 누적)로 복귀한다.
- 여러 TEMPO/PROB가 동일 시각에 겹칠 경우, 시간순(정의 순서)으로 순차 적용한다.

```
예시:
  Base + BECMG 누적 결과: vis=9999, wx=없음, clouds=FEW040
  TEMPO 0900/0906: vis=3000, wx=[TSRA], clouds=[BKN010CB]

  시각 0859: vis=9999, wx=없음, clouds=FEW040      (TEMPO 미적용)
  시각 0900: vis=3000, wx=TSRA, clouds=BKN010CB    (TEMPO 적용)
  시각 0905: vis=3000, wx=TSRA, clouds=BKN010CB    (TEMPO 적용)
  시각 0906: vis=9999, wx=없음, clouds=FEW040      (TEMPO 종료, 복귀)
```

### 6.4 TEMPO/PROB 겹침 처리

동일 시각에 여러 TEMPO/PROB가 활성인 경우, TAF 전문에 기술된 순서대로 순차 partial_merge한다. 나중에 적용되는 그룹이 앞의 그룹을 덮어쓸 수 있다.

```
예시:
  TEMPO 0900/0906: vis=5000, wx=[RA]
  PROB40 0903/0909: vis=1500, wx=[+TSRA], clouds=[BKN008CB]

  시각 0904:
    1) Base + BECMG 적용
    2) TEMPO 적용: vis=5000, wx=[RA]
    3) PROB40 적용: vis=1500, wx=[+TSRA], clouds=[BKN008CB]
    최종: vis=1500, wx=+TSRA, clouds=BKN008CB
```

---

## 7. 표시 규칙

### 7.1 기온 표시 (헤더 영역)

기온은 시간별 상태가 아닌 TAF 헤더 정보로 별도 표시한다.

```
표시 형식:
  최고기온: [value]°C / [DD]일 [hh]Z
  최저기온: [value]°C / [DD]일 [hh]Z

예시:
  TX25/0814Z TN18/0905Z
  → 최고기온: 25°C / 08일 14Z
    최저기온: 18°C / 09일 05Z

  TXM02/0914Z TNM08/1005Z
  → 최고기온: -2°C / 09일 14Z
    최저기온: -8°C / 10일 05Z
```

기온 정보가 TAF에 포함되지 않은 경우 해당 영역을 생략한다.

### 7.2 일반 표시

| 요소 | 표시 방법 |
|------|----------|
| wind | 원문 그대로 (예: "28015G25KT") |
| vis | 숫자 그대로 (예: "4000") |
| wx | 구조화 표시 (아래 7.3 참조) |
| clouds | 공백 구분 나열 (예: "SCT010 BKN030") |

### 7.3 기상현상 구조화 표시

각 WeatherPhenomenon 객체를 원문(raw) 형태로 표시하되, 구조화된 내부 데이터를 활용하여 정확한 해석을 보장한다.

```
표시: raw 필드를 그대로 출력
  예: "+TSRA" → "+TSRA"
      "-FZDZ" → "-FZDZ"
      "VCSH"  → "VCSH"

복수 현상: 공백으로 구분
  예: wx = [{raw:"+TSRA"}, {raw:"-DZ"}] → "+TSRA -DZ"
```

구조화 데이터의 활용 예시:
- 강도별 필터링: intensity == HEAVY인 현상만 추출
- 특성별 분류: descriptor == TS인 현상(뇌전 관련) 식별
- VC 현상 구분: intensity == VICINITY인 현상을 별도 표기

### 7.4 특수 표시

| 조건 | 표시 |
|------|------|
| cavok_flag == true | vis, wx, clouds 대신 **"CAVOK"** 단일 표시 |
| nsc_flag == true | clouds 위치에 **"NSC"** 표시 |
| wx == [] (플래그 없음) | 기상현상 없음 표시 (빈칸 또는 "-" 등) |
| clouds == [] (플래그 없음) | 상황에 맞게 표시 |

### 7.5 CAVOK/NSC 플래그 해제 조건

BECMG나 TEMPO에 의해 vis, wx, clouds 중 하나라도 변경되면 CAVOK 플래그는 해제된다. 이후부터는 개별 요소로 표시한다.

```
예시:
  BECMG 0818: CAVOK          → 표시: "CAVOK"
  TEMPO 0900/0906: 3000 TSRA BKN010CB
    → 0900~0905: 표시: vis=3000, wx=TSRA, clouds=BKN010CB (CAVOK 아님)
    → 0906: TEMPO 종료 → CAVOK 복귀 → 표시: "CAVOK"
```

---

## 8. 엣지 케이스 처리

### 8.1 BECMG 두 개가 같은 요소를 변경

나중 BECMG가 덮어쓴다. 시간순 누적이므로 자연스럽게 처리된다.

```
BECMG 0803: vis=4000
BECMG 0808: vis=8000

시각 0810: vis=8000 (두 번째가 첫 번째를 덮어씀)
```

### 8.2 TEMPO 구간 내에서 BECMG 시작

BECMG는 Base State를 변경하고, TEMPO는 그 위에 오버라이드한다. 알고리즘 순서(BECMG 먼저 → TEMPO 나중)에 의해 자연스럽게 처리된다.

```
BECMG 0804: wind=12010KT
TEMPO 0803/0806: vis=3000, wx=[TSRA]

시각 0805:
  1) Base + BECMG: wind=12010KT, vis=9999
  2) + TEMPO: wind=12010KT, vis=3000, wx=[TSRA]
```

### 8.3 NSW 후 시정이 변경되는 BECMG

```
Base: vis=3000, wx=[RA]
BECMG 0806: wx=[]  (NSW 전개)
BECMG 0810: vis=9999

시각 0807: vis=3000, wx=[] → 후처리 → wx=[BR]  (시정 3000이므로)
시각 0811: vis=9999, wx=[] → 후처리 → wx=[]     (시정 9999이므로 부여 안 함)
```

### 8.4 날짜 넘김 (Month Rollover)

TAF 전문의 시간 표기는 `DDhh` 형식(일+시간)이며, 월(Month)과 연(Year) 정보가 없다. TAF 유효기간이 월 경계를 넘는 경우, `DD`가 감소하여 단순 비교로는 과거/미래 판정이 불가능하다.

#### 8.4.1 문제 케이스

```
예시 1: 월말 → 월초
  발표: 2026-01-31T05:00Z
  유효기간: 3106/0112  (1월 31일 06Z ~ 2월 1일 12Z)
  BECMG: 0103/0106     (2월 1일 03Z ~ 06Z)
  → DD=01이 DD=31보다 작지만, 과거가 아니라 다음 달

예시 2: 윤년
  발표: 2028-02-28T18:00Z
  유효기간: 2818/0106  (2월 28일 18Z ~ 3월 1일 06Z)
  → 2028년은 윤년이므로 2월 29일이 존재
  → DD=01은 2월 29일 다음날인 3월 1일

예시 3: 윤년이 아닌 해
  발표: 2026-02-28T18:00Z
  유효기간: 2818/0106
  → 2026년은 평년이므로 2월 29일 없음
  → DD=01은 바로 3월 1일
```

#### 8.4.2 DDhh → DateTime 변환 알고리즘

모든 DDhh 변환은 기준 시각(anchor)을 필요로 한다.

```
함수 resolve_ddhh(ddhh, anchor):
    // anchor: 이 DDhh가 속한 TAF의 issued 시각 (DateTime)
    // ddhh: "DDhh" 문자열 (예: "0106", "3112")
    
    DD = ddhh의 앞 2자리 (정수)
    hh = ddhh의 뒤 2자리 (정수)
    
    // 1단계: anchor와 같은 월에서 시도
    candidate = DateTime(anchor.year, anchor.month, DD, hh, 0, 0, UTC)
    
    // 2단계: 해당 월에 DD일이 존재하는지 확인
    if DD > days_in_month(anchor.year, anchor.month):
        // 이 월에 해당 일이 없음 → 에러 (발생하면 안 됨)
        // 예: 2월에 DD=30이면 잘못된 전문
        log_error("DDhh 변환 실패: {ddhh}, anchor={anchor}")
        return null
    
    // 3단계: 월 경계 판정
    // anchor.day와 DD의 차이로 판정
    // 핵심 규칙: TAF 유효기간은 최대 30시간이므로,
    // DD가 anchor.day보다 크게 앞서면(예: 15일 이상 차이) 다음 달로 간주
    
    if candidate < anchor - 24시간:
        // candidate가 anchor보다 1일 넘게 과거 → 다음 달로 이동
        next_month = anchor.month + 1
        next_year = anchor.year
        if next_month > 12:
            next_month = 1
            next_year = next_year + 1
        
        // 다음 달에 DD일이 존재하는지 확인
        if DD > days_in_month(next_year, next_month):
            log_error("DDhh 변환 실패: {ddhh}, next month에도 해당 일 없음")
            return null
        
        candidate = DateTime(next_year, next_month, DD, hh, 0, 0, UTC)
    
    return candidate
```

#### 8.4.3 days_in_month 함수

```
함수 days_in_month(year, month):
    // 각 월의 일수 (1~12)
    days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    // 윤년 판정 (2월만 영향)
    if month == 2:
        if (year % 4 == 0 AND year % 100 ≠ 0) OR (year % 400 == 0):
            return 29
    
    return days[month - 1]
```

#### 8.4.4 적용 범위

`resolve_ddhh`는 다음 모든 DDhh 변환에 사용한다:

| 필드 | anchor |
|------|--------|
| TAF valid_start / valid_end | `issued` 시각 |
| ChangeGroup start / end | `issued` 시각 |
| Temperature time (TX/TN) | `issued` 시각 |

#### 8.4.5 IWXXM XML에서의 적용

IWXXM XML에서 대부분의 시각은 ISO 8601 전체 형식(`2026-02-08T06:00:00Z`)으로 제공되므로 DDhh 변환이 불필요하다:

- `valid_start` / `valid_end`: ISO 8601 ✅
- changeForecast의 `beginPosition` / `endPosition`: ISO 8601 ✅

**그러나 기온(TX/TN)의 시각은 DDhh 형식**이다 (C.4.6절 참조):
- `maximumAirTemperatureTime`: DDhh ❌ → `resolve_ddhh` **필요**
- `minimumAirTemperatureTime`: DDhh ❌ → `resolve_ddhh` **필요**

또한, 시간별 분해(6절) 시 `valid_start`부터 `valid_end`까지 1시간씩 증가시키면서 DateTime을 생성하는데, 이 과정에서 월 경계를 넘는 연산(`2026-01-31T23:00Z` + 1h → `2026-02-01T00:00Z`)은 표준 DateTime 라이브러리가 처리한다. 직접 구현하지 않는다.

**결론**: `resolve_ddhh`는 IWXXM XML에서도 기온 시각 변환에 반드시 사용된다. 텍스트 TAF가 추가될 경우 모든 시간 필드에 사용된다.

#### 8.4.6 검증 케이스

| 입력 | anchor | 기대 결과 |
|------|--------|----------|
| `3112` | 2026-01-31T05:00Z | 2026-01-31T12:00Z |
| `0112` | 2026-01-31T05:00Z | 2026-02-01T12:00Z |
| `0106` | 2026-02-28T18:00Z (평년) | 2026-03-01T06:00Z |
| `0106` | 2028-02-28T18:00Z (윤년) | 2028-03-01T06:00Z |
| `2906` | 2028-02-28T18:00Z (윤년) | 2028-02-29T06:00Z |
| `2906` | 2026-02-27T18:00Z (평년) | 에러 또는 예외 (2월 29일 없음) |

### 8.5 동일 시각에 BECMG 시작과 TEMPO 시작이 겹침

알고리즘 순서에 의해 BECMG가 먼저 Base에 반영된 후, TEMPO가 오버라이드한다.

---

## 9. 처리 순서 요약

매 시각 t에 대해 아래 순서를 반드시 준수한다:

```
┌─────────────────────────────────────────────┐
│ 1. Base State 복사                          │
│                                             │
│ 2. BECMG 누적 적용 (시간순)                 │
│    - t >= becmg.start 인 모든 BECMG         │
│    - partial_merge (부분 갱신)               │
│    → 여기까지가 "확정 기본 상태"             │
│                                             │
│ 3. TEMPO/PROB 오버라이드 적용 (시간순)       │
│    - tempo.start ≤ t < tempo.end 인 것만     │
│    - partial_merge (부분 갱신)               │
│    → 여기까지가 "최종 병합 상태"             │
│                                             │
│ 4. NSW 후처리                               │
│    - wx==[] 이고 1000≤vis<5000 이면 wx=[BR]  │
│                                             │
│ 5. 표시 규칙 적용                           │
│    - CAVOK/NSC 플래그 검사                   │
│    - 최종 출력 생성                          │
└─────────────────────────────────────────────┘
```

---

## 10. 검증 체크리스트

구현 후 아래 케이스를 반드시 검증한다.

| # | 테스트 케이스 | 검증 포인트 |
|---|-------------|------------|
| 1 | Base만 있는 TAF | 모든 시각이 동일한 Base 상태 |
| 2 | BECMG 1개 (바람만 변경) | 시작 전: 이전 바람, 시작 후: 새 바람, 나머지 요소 유지 |
| 3 | BECMG 1개 (CAVOK) | 시작 후: vis=9999, wx=없음, clouds=없음, 표시="CAVOK" |
| 4 | BECMG에 NSW | wx=[] 전개 후 시정에 따라 BR 자동 부여 여부 |
| 5 | BECMG에 NSC | clouds=[] 전개, 표시="NSC" |
| 6 | BECMG 2개 순차 (같은 요소) | 나중 것이 앞의 것을 덮어쓰는지 |
| 7 | BECMG 2개 순차 (다른 요소) | 각각 독립적으로 누적되는지 |
| 8 | TEMPO 1개 | 구간 내: 오버라이드, 구간 외: 원래 상태 복귀 |
| 9 | TEMPO에서 CAVOK 상태를 깨뜨림 | TEMPO 중: 개별 표시, TEMPO 종료 후: CAVOK 복귀 |
| 10 | TEMPO 2개 겹침 | 순차 적용, 나중 것이 우선 |
| 11 | PROB40 단독 | TEMPO와 동일하게 구간 내 적용 |
| 12 | PROB30 TEMPO | TEMPO와 동일하게 구간 내 적용 |
| 13 | BECMG + TEMPO 동시 활성 | BECMG 먼저 → TEMPO 나중 순서 |
| 14 | NSW 후 시정 4000 | wx=[BR] 자동 부여 |
| 15 | NSW 후 시정 9999 | wx=[] 유지 (부여 안 함) |
| 16 | 날짜 넘김: 월말→월초 (3112/0112) | 0112 → 다음 달 1일 12Z |
| 16a | 날짜 넘김: 윤년 2월 (2028-02-28 → 0106) | 0106 → 2028-03-01T06Z |
| 16b | 날짜 넘김: 평년 2월 (2026-02-28 → 0106) | 0106 → 2026-03-01T06Z |
| 16c | 날짜 넘김: 윤년 2월29일 존재 (2028-02-28 anchor, DD=29) | 2906 → 2028-02-29T06Z |
| 17 | TX/TN 포함 TAF | 헤더에 최고/최저기온 정상 표시 |
| 18 | TNM03 (영하 기온) | M 접두어 → 음수 변환 (-3°C) |
| 19 | TX/TN 미포함 TAF | 기온 영역 생략, 오류 없음 |
| 20 | 기상현상 `-RA` | intensity=LIGHT, phenomena=[RA] |
| 21 | 기상현상 `+TSRA` | intensity=HEAVY, descriptor=TS, phenomena=[RA] |
| 22 | 기상현상 `VCSH` | intensity=VICINITY, descriptor=SH |
| 23 | 기상현상 `-FZDZ` | intensity=LIGHT, descriptor=FZ, phenomena=[DZ] |
| 24 | 복합 현상 `+TSSNGR` | intensity=HEAVY, descriptor=TS, phenomena=[SN,GR] |
| 25 | NSW 후처리 + 구조화 | wx=[] → BR 자동 부여 시 WeatherPhenomenon 객체 생성 |
| 26 | XML: cloudAndVisibilityOK="true" | CAVOK 정규화 정상 동작 |
| 27 | XML: weather xlink:href URL | 코드 추출 및 WeatherPhenomenon 파싱 |
| 28 | XML: weather nilReason (NSW) | wx=[] 정규화 |
| 29 | XML: weather 노드 없음 | wx=null (언급 없음, 기존값 유지) |
| 30 | XML: cloud 복수 layer | 모든 layer 추출, 순서 유지 |
| 31 | XML: temperature 음수 | "-08" → value: -8 |
| 32 | XML: changeIndicator 매핑 | BECOMING/TEMPORARY_FLUCTUATIONS 등 정상 변환 |
| 33 | JSON: RKSI 샘플 전체 시간별 출력 | 부록 D.4 기대값과 일치 |
| 34 | JSON: RKPC 샘플 전체 시간별 출력 | 부록 D.5 기대값과 일치 |
| 35 | touched: SCT020 → BECMG NSC | clouds=[], nsc_flag=true (SCT020 잔존 시 실패) |
| 36 | touched: CAVOK base + wind-only BECMG | cavok_flag=true 유지 (해제 시 실패) |
| 37 | touched: NSC base + TEMPO BKN020 | TEMPO 구간에서 clouds=[BKN020], nsc_flag=false |

---

## 부록 A. 용어 정의

| 용어 | 정의 |
|------|------|
| Base State | TAF 유효기간 시작 시 적용되는 최초 예보 상태 |
| WeatherPhenomenon | 기상현상 하나를 강도/특성/현상본체로 구조화한 객체 |
| partial_merge | 변화 그룹의 touched 필드만 현재 상태에 덮어쓰는 연산 |
| touched 플래그 | 원문/XML에서 해당 필드가 언급되었는지를 나타내는 bool (wx_touched, clouds_touched) |
| 정규화 | CAVOK/NSW/NSC를 원시 기상 요소로 전개하는 전처리 과정 |
| NSW 후처리 | wx=[]인 상태에서 시정에 따라 BR을 자동 부여하는 후처리 |
| 확정 기본 상태 | Base + BECMG 누적 결과 |
| 최종 병합 상태 | 확정 기본 상태 + TEMPO/PROB 오버라이드 결과 |

## 부록 B. 본 알고리즘에서 제외된 항목

| 항목 | 제외 사유 |
|------|----------|
| FM 그룹 | 설계 요구사항에 의해 배제 |
| 기온 예보 (TX/TN) | 헤더 영역에 별도 표시로 포함 (시간별 분해 대상 아님) |
| 윈드시어 (WS) | 시간별 분해 대상 아님 |
| RVR | TAF에 포함되지 않음 |
| BECMG 전환 구간 보간 | 즉시 적용 방식 채택으로 불필요 |

---

## 부록 C. IWXXM XML 파싱 규칙

### C.1 XML 소스 구조

KMA API 응답 전체를 파싱한다. 1회 API 호출 = 1공항 = 1 TAF.

```
response
  └ body
    └ items
      └ item
        ├ icaoCode          (비어있을 수 있음 — iwxxm 내부에서 추출)
        ├ airportName       (비어있을 수 있음 — iwxxm 내부에서 추출)
        └ tafMsg
          └ iwxxm:TAF       ← 실제 파싱 대상
```

### C.2 네임스페이스

XML 파싱 시 아래 네임스페이스를 등록해야 한다.

```
네임스페이스 맵:
  iwxxm  = "http://icao.int/iwxxm/2023-1"
  gml    = "http://www.opengis.net/gml/3.2"
  aixm   = "http://www.aixm.aero/schema/5.1.1"
  xlink  = "http://www.w3.org/1999/xlink"
```

### C.3 TAF 헤더 매핑

| 내부 모델 | XML 경로 | 추출 방법 |
|-----------|----------|----------|
| icao | `iwxxm:aerodrome > aixm:AirportHeliport > aixm:timeSlice > aixm:AirportHeliportTimeSlice > aixm:locationIndicatorICAO` | 텍스트 |
| airport_name | 같은 경로 > `aixm:name` | 텍스트 |
| issued | `iwxxm:issueTime > gml:TimeInstant > gml:timePosition` | ISO 8601 파싱 |
| valid_start | `iwxxm:validPeriod > gml:TimePeriod > gml:beginPosition` | ISO 8601 파싱 |
| valid_end | `iwxxm:validPeriod > gml:TimePeriod > gml:endPosition` | ISO 8601 파싱 |

### C.4 기상 예보 블록 매핑 (Base 및 Change 공통)

Base와 Change 모두 `iwxxm:MeteorologicalAerodromeForecast` 노드이며, 동일한 하위 구조를 공유한다.

#### C.4.1 CAVOK 판별

```
XML 속성: cloudAndVisibilityOK="true" | "false"

cloudAndVisibilityOK == "true"
  → cavok_flag = true
  → 정규화: vis="9999", wx=[], clouds=[]
  → vis, weather, cloud 하위 노드 무시 (존재하지 않을 수 있음)
```

#### C.4.2 바람 (surfaceWind)

```
XML 경로: iwxxm:surfaceWind > iwxxm:AerodromeSurfaceWindForecast

추출:
  variableWindDirection: 속성 "variableWindDirection" ("true"/"false")
  meanWindDirection:     iwxxm:meanWindDirection 텍스트 (단위: deg)
  meanWindSpeed:         iwxxm:meanWindSpeed 텍스트 (단위: [kn_i])
  windGustSpeed:         iwxxm:windGustSpeed 텍스트 (선택, 없을 수 있음)

변환 → 내부 wind 문자열:
  if variableWindDirection == "true":
      wind = "VRB{speed:02d}KT"
  else:
      wind = "{direction:03d}{speed:02d}KT"
  
  if windGustSpeed 존재:
      wind = "{direction:03d}{speed:02d}G{gust:02d}KT"

예시:
  direction=330, speed=15, gust=25 → "33015G25KT"
  direction=330, speed=7, gust=없음 → "33007KT"
  variable=true, speed=3 → "VRB03KT"

특수 케이스:
  speed=0, direction=0 (또는 direction 없음) → "00000KT" (정온)
```

#### C.4.3 시정 (prevailingVisibility)

```
XML 경로: iwxxm:prevailingVisibility

추출:
  값: 텍스트 (숫자), 단위: uom 속성 (항상 "m")

변환:
  vis = 텍스트 값을 4자리 문자열로 (예: "6000", "9999", "0800")

CAVOK인 경우:
  이 노드가 없을 수 있음 → 정규화에서 "9999" 설정
```

#### C.4.4 기상현상 (weather)

**가장 복잡한 매핑 규칙이다.**

기상현상은 세 가지 형태로 나타난다:

```
형태 1: 현상 있음 (xlink:href)
  <iwxxm:weather xlink:href="http://codes.wmo.int/306/4678/-SHSN"/>
  → URL의 마지막 경로 세그먼트 추출: "-SHSN"
  → WeatherPhenomenon 파싱 규칙(2.2절) 적용

형태 2: NSW (nilReason)
  <iwxxm:weather nilReason="http://codes.wmo.int/common/nil/nothingOfOperationalSignificance"/>
  → NSW로 판별
  → 정규화: wx = []

형태 3: 노드 없음
  weather 노드 자체가 없음
  → wx = null (이 그룹은 wx에 대해 언급 없음)
```

**복수 기상현상**: weather 노드가 여러 개 올 수 있다.

```
<iwxxm:weather xlink:href="http://codes.wmo.int/306/4678/+TSRA"/>
<iwxxm:weather xlink:href="http://codes.wmo.int/306/4678/BR"/>
→ wx = [parse("+TSRA"), parse("BR")]
```

**URL에서 코드 추출 규칙**:

```
URL: "http://codes.wmo.int/306/4678/{code}"
추출: URL을 "/" 로 분할 → 마지막 세그먼트가 기상현상 코드
예시:
  ".../306/4678/-SHSN" → "-SHSN"
  ".../306/4678/BR"    → "BR"
  ".../306/4678/+TSRA" → "+TSRA"
  ".../306/4678/VCSH"  → "VCSH"
```

#### C.4.5 구름 (cloud)

```
XML 경로: iwxxm:cloud > iwxxm:AerodromeCloudForecast > iwxxm:layer (복수 가능)

각 layer:
  iwxxm:CloudLayer > iwxxm:amount: xlink:href 속성에서 추출
  iwxxm:CloudLayer > iwxxm:base: 텍스트 (단위: [ft_i])

amount URL 추출:
  "http://codes.wmo.int/49-2/CloudAmountReportedAtAerodrome/{code}"
  → 마지막 세그먼트: FEW, SCT, BKN, OVC

변환 → 내부 clouds 문자열:
  "{amount}{base:03d}"   (base를 100ft 단위로 나눔)
  
예시:
  amount=FEW, base=1500ft → "FEW015"
  amount=BKN, base=3000ft → "BKN030"
  amount=SCT, base=3500ft → "SCT035"

특수 케이스:
  cloud 노드 없음 → clouds = null (언급 없음)
  CAVOK 시 → 정규화에서 clouds = []
```

**NSC 판별**:

```
cloud 노드에 nilReason 속성이 있는 경우:
  <iwxxm:cloud nilReason="http://codes.wmo.int/common/nil/nothingOfOperationalSignificance"/>
  → NSC로 판별
  → 정규화: clouds = [], nsc_flag = true
```

#### C.4.6 기온 (temperature)

```
XML 경로: iwxxm:temperature > iwxxm:AerodromeAirTemperatureForecast

추출:
  maximumAirTemperature: 텍스트 (정수, 음수 가능)
  maximumAirTemperatureTime: gml:timePosition 텍스트 (DDhh 형식)
  minimumAirTemperature: 텍스트 (정수, 음수 가능)
  minimumAirTemperatureTime: gml:timePosition 텍스트 (DDhh 형식)

변환 (resolve_ddhh 필수):
  tx_time = resolve_ddhh(maximumAirTemperatureTime, issued)
  tn_time = resolve_ddhh(minimumAirTemperatureTime, issued)
  
  TX: { type: TX, value: int(maximumAirTemperature), time: tx_time }
  TN: { type: TN, value: int(minimumAirTemperature), time: tn_time }

예시:
  issued = 2026-02-08T05:00:00Z
  max=05, time="0906" → resolve_ddhh("0906", issued) → 2026-02-09T06:00Z
  min=-08, time="0821" → resolve_ddhh("0821", issued) → 2026-02-08T21:00Z

월 경계 예시:
  issued = 2026-01-31T17:00:00Z
  max=03, time="0106" → resolve_ddhh("0106", issued) → 2026-02-01T06:00Z
  (DD=01 < anchor.day=31 → 다음 달로 이동)

참고: XML에서 음수는 "-08" 형태로 직접 표현됨 (TAF 원문의 M 접두어와 다름)
```

기온은 baseForecast에만 존재한다. changeForecast에는 포함되지 않는다.

### C.5 변화 그룹 (changeForecast) 매핑

```
XML 경로: iwxxm:changeForecast > iwxxm:MeteorologicalAerodromeForecast

changeIndicator 속성 → 내부 type 매핑:
  "BECOMING"                  → BECMG
  "TEMPORARY_FLUCTUATIONS"    → TEMPO
  "PROBABILITY_30"            → PROB30
  "PROBABILITY_40"            → PROB40
  "PROBABILITY_30_TEMPORARY_FLUCTUATIONS" → PROB30_TEMPO
  "PROBABILITY_40_TEMPORARY_FLUCTUATIONS" → PROB40_TEMPO

시간 범위:
  start = phenomenonTime > gml:TimePeriod > gml:beginPosition
  end   = phenomenonTime > gml:TimePeriod > gml:endPosition

나머지 요소(wind, vis, wx, clouds)는 C.4절과 동일한 규칙으로 추출.
존재하지 않는 요소는 null로 설정.
```

**touched 플래그 설정 규칙 (파서 단계)**

```
wx_touched 결정:
  iwxxm:weather 노드가 존재 (xlink:href 또는 nilReason 어느 것이든)
    → wx_touched = true
  iwxxm:weather 노드 자체가 없음
    → wx_touched = false

clouds_touched 결정:
  iwxxm:cloud 노드가 존재 (layer가 있든, nilReason이든)
    → clouds_touched = true
  iwxxm:cloud 노드 자체가 없음
    → clouds_touched = false

CAVOK(cloudAndVisibilityOK="true") 시:
  → wx_touched = true, clouds_touched = true
  (CAVOK는 wx와 clouds 모두에 대해 "없음"을 명시한 것이므로)
```

### C.6 파싱 파이프라인 요약

```
┌─────────────────────────────────────────────────────────┐
│ 1. API 응답 XML 수신                                    │
│                                                         │
│ 2. response > body > items > item > tafMsg > iwxxm:TAF  │
│    노드 탐색                                            │
│                                                         │
│ 3. TAF 헤더 추출 (C.3절)                                │
│    - icao, airport_name, issued, valid_start, valid_end  │
│                                                         │
│ 4. baseForecast 추출 (C.4절)                            │
│    - CAVOK 판별 → wind, vis, wx, clouds, temperature     │
│                                                         │
│ 5. changeForecast 순회 (C.5절)                          │
│    - 각 그룹: type, start, end, wind, vis, wx, clouds    │
│                                                         │
│ 6. 정규화 (본문 3절)                                    │
│    - CAVOK 전개, NSW 전개, NSC 전개                      │
│                                                         │
│ 7. 기상현상 구조화 파싱 (본문 2.2절)                    │
│    - URL에서 추출한 코드 → WeatherPhenomenon 객체        │
│                                                         │
│ 8. 내부 TAF 객체 생성 완료                              │
│    → 본문 6절 메인 알고리즘 실행                        │
└─────────────────────────────────────────────────────────┘
```

---

## 부록 D. JSON 출력 스키마

### D.1 파일명 규칙

```
TAF_{YYYYMMDDTHHMMSSmmmZ}.json

예시: TAF_20260211T102641791Z.json
      (전체 공항 통합, 조회 시점 기준)
```

### D.2 JSON 구조

전체 공항의 TAF를 하나의 JSON에 통합한다. ICAO 코드를 키로 한다.

```json
{
  "type": "TAF",
  "fetched_at": "2026-02-08T10:30:00Z",
  "airports": {
    "RKSI": {
      "header": {
        "icao": "RKSI",
        "airport_name": "INCHEON INTERNATIONAL AIRPORT",
        "issued": "2026-02-08T05:00:00Z",
        "valid_start": "2026-02-08T06:00:00Z",
        "valid_end": "2026-02-09T12:00:00Z",
        "temperatures": {
          "max": { "value": 3, "time": "2026-02-09T06:00:00Z" },
          "min": { "value": -8, "time": "2026-02-08T21:00:00Z" }
        }
      },
      "timeline": [
        {
          "time": "2026-02-08T06:00:00Z",
          "wind": {
            "raw": "33015G25KT",
            "direction": 330,
            "speed": 15,
            "gust": 25,
            "unit": "KT",
            "variable": false
          },
          "visibility": {
            "value": 9999,
            "cavok": true
          },
          "weather": [],
          "clouds": [],
          "display": {
            "wind": "33015G25KT",
            "visibility": "CAVOK",
            "weather": "",
            "clouds": "CAVOK"
          }
        },
        {
          "time": "2026-02-08T07:00:00Z",
          "wind": { "..." : "..." },
          "visibility": { "..." : "..." },
          "weather": [
            {
              "raw": "-SHSN",
              "intensity": "LIGHT",
              "descriptor": "SH",
              "phenomena": ["SN"]
            }
          ],
          "clouds": [
            { "amount": "FEW", "base": 1500, "raw": "FEW015" },
            { "amount": "BKN", "base": 3000, "raw": "BKN030" }
          ],
          "display": {
            "wind": "33020G37KT",
            "visibility": "6000",
            "weather": "-SHSN",
            "clouds": "FEW015 BKN030"
          }
        }
      ]
    },
    "RKPC": {
      "header": { "..." : "..." },
      "timeline": [ "..." ]
    }
  }
}
```

### D.3 각 필드 상세

#### wind 객체

```json
{
  "raw": "33015G25KT",
  "direction": 330,        // 정수, 정온 시 0
  "speed": 15,             // 정수
  "gust": 25,              // 정수 또는 null (돌풍 없음)
  "unit": "KT",            // 항상 "KT"
  "variable": false         // true: VRB
}
```

#### visibility 객체

```json
{
  "value": 9999,           // 정수 (미터)
  "cavok": true            // CAVOK 여부
}
```

#### weather 배열 요소

```json
{
  "raw": "-SHSN",
  "intensity": "LIGHT",    // "LIGHT" | "MODERATE" | "HEAVY" | "VICINITY"
  "descriptor": "SH",      // "MI"|"BC"|"PR"|"DR"|"BL"|"SH"|"TS"|"FZ" | null
  "phenomena": ["SN"]      // 2글자 코드 배열
}
```

기상현상 없음: `weather: []` (빈 배열)

#### clouds 배열 요소

```json
{
  "amount": "FEW",         // "FEW"|"SCT"|"BKN"|"OVC"
  "base": 1500,            // 정수 (ft, AGL)
  "raw": "FEW015"          // 표시용 문자열
}
```

구름 없음 (NSC): `clouds: []` (빈 배열)

#### display 객체

사람이 읽기 쉬운 최종 표시 문자열이다. 본문 7절 표시 규칙을 적용한 결과.

```json
{
  "wind": "33015G25KT",
  "visibility": "CAVOK",        // CAVOK 시 "CAVOK", 그 외 숫자 문자열
  "weather": "-SHSN BR",        // 공백 구분, 없으면 ""
  "clouds": "CAVOK"             // CAVOK 시 "CAVOK", NSC 시 "NSC", 그 외 raw 나열
}
```

### D.4 샘플 XML에 대한 기대 출력 (RKSI, 발췌)

```
시각          | wind        | vis   | wx | clouds | display.visibility
-------------|-------------|-------|----|--------|-------------------
0806 (06Z)   | 33015G25KT  | 9999  | [] | []     | CAVOK
...          | (동일)       | 9999  | [] | []     | CAVOK
0813 (13Z)   | 33007KT     | 9999  | [] | []     | CAVOK   ← BECMG 즉시적용: wind 변경
...          | (동일)       | 9999  | [] | []     | CAVOK
0816~0817    | 07006KT     | 9999  | [] | []     | CAVOK   ← TEMPO: wind만 오버라이드
0819 (19Z)   | 16006KT     | 9999  | [] | []     | 9999    ← BECMG: wind+vis+clouds 변경
             |             |       |    |SCT035  | (CAVOK 해제)
...
```

### D.5 샘플 XML에 대한 기대 출력 (RKPC, 발췌)

```
시각          | wind        | vis   | wx     | clouds          | display
-------------|-------------|-------|--------|-----------------|--------
0806 (06Z)   | 33020G37KT  | 6000  | -SHSN  | FEW015 BKN030   | 6000
...          | (동일)       | 6000  | -SHSN  | FEW015 BKN030   | 6000
0810 (10Z)   | 32015G25KT  | 9999  | []     | FEW015 BKN030   | 9999  ← BECMG: wind+vis+NSW
0816 (16Z)   | 30008KT     | 9999  | []     | FEW015 BKN030   | 9999  ← BECMG: wind
0902 (02Z)   | 30008KT     | 9999  | []     | SCT030          | 9999  ← BECMG: clouds
0908 (08Z)   | 19005KT     | 9999  | []     | SCT030          | 9999  ← BECMG: wind
```

---

## 부록 E. 모듈 구조 및 전체 파이프라인

### E.1 파일 구조

```
KMA_weather_dashboard/
  ├ backend/src/parsers/taf-parser.js
  ├ backend/src/processors/taf-processor.js
  ├ backend/src/store.js
  └ backend/src/index.js
```

- 구현은 parser / processor / store / scheduler로 역할을 분리한다.
- 공통 로직(wind/weather/cloud 파싱 등)은 `backend/src/parsers/parse-utils.js`에 공유한다.
- 상세 모듈 설계는 METAR 설계문서 6절을 참조한다.

### E.2 파이프라인

backend/src/parsers/taf-parser.js 내부 처리 흐름:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  XML 입력    │ ──→ │  XML 파싱    │ ──→ │  알고리즘    │ ──→ │  결과 반환   │
│  (1공항)     │     │  (부록 C)    │     │  (본문 6절)  │     │  (객체)      │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                           │                     │
                           ▼                     ▼
                     ┌──────────┐          ┌──────────┐
                     │ 정규화   │          │ NSW후처리 │
                     │ (본문3절)│          │ (본문4절) │
                     └──────────┘          └──────────┘
```

현재 구현에서 parser는 `parse(xml)`만 담당한다. 전체 공항 통합, 실패 공항 복구(`mergeWithPrevious`), 저장(`store.save("taf", result)`), 스케줄링은 processor/store/index가 담당한다.

```
입력: KMA API XML 응답 (1공항)
출력: { header: {...}, timeline: [...] } 객체 반환
      → main이 airports[icao]에 할당
      → canonical hash 비교 후 변경 시 TAF_{YYYYMMDDTHHMMSSmmmZ}.json으로 저장
```

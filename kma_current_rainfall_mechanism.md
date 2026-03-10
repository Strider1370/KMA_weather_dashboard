# KMA AMOS API를 활용한 현재 강수량 표시 메커니즘

## 1. 목적

기상청 AMOS API에서 제공하는 관측 자료 중 **강수량(`RN`)** 값을 추출하여,
특정 공항 지점의 **현재 강수량**을 화면 또는 시스템에 표시하는 메커니즘을 정의한다.

이 문서는 다음 API를 기준으로 작성한다.

- API 주소 예시  
  `https://apihub.kma.go.kr/api/typ01/url/amos.php?tm=202211301200&dtm=5&stn=113&help=1&authKey=인증키`

---

## 2. API 개요

### 2.1 기본 주소

```text
https://apihub.kma.go.kr/api/typ01/url/amos.php
```

### 2.2 요청 인자

| 인자명 | 의미 | 설명 |
|---|---|---|
| `tm` | 조회시각 | `YYYYMMDDHHMI` 형식의 KST 시각. 없으면 현재시각 기준 |
| `dtm` | 시간구간 | `tm`을 포함하여 과거 `dtm`분부터 자료 제공. 최대 60분 |
| `stn` | 지점번호 | 특정 지점 지정. 예: `113` 인천공항 |
| `help` | 도움말 | `1`이면 필드 설명이 포함된 형태로 응답 |
| `authKey` | 인증키 | 발급받은 API 키 |

### 2.3 주요 지점번호 예시

| 지점번호 | 공항 |
|---|---|
| 113 | 인천공항 |
| 110 | 김포공항 |
| 182 | 제주공항 |
| 163 | 무안공항 |
| 151 | 울산공항 |
| 167 | 여수공항 |
| 92 | 양양공항 |

---

## 3. 응답 데이터에서 강수량 필드

응답 본문에서 강수량은 아래 필드에 해당한다.

| 순번 | 필드명 | 의미 | 단위 |
|---|---|---|---|
| 13 | `RN` | 강수량 | `0.1 mm` |

즉,

- `0` → `0.0 mm`
- `1` → `0.1 mm`
- `15` → `1.5 mm`

처럼 해석한다.

---

## 4. 응답 구조 이해

API 응답은 일반적인 JSON이 아니라, **주석/설명부 + 데이터 본문**으로 이루어진 텍스트 형식이다.

예시:

```text
#START7777
# ... 설명부 생략 ...
 113 202211301155  10000 -99999   2000 -99999   3300    -43   -138     48  10341  10332      0 -99999 -99999    350    360    330     63     86     42    330    360    310     59     86     32
 113 202211301156  10000 -99999   2000 -99999   3300    -45   -140     47  10341  10332      0 -99999 -99999    340    360    330     69     86     57    330    360    310     61     86     38
 113 202211301157  10000 -99999   2000 -99999   3300    -45   -139     48  10341  10332      0 -99999 -99999    350     10    330     61     82     46    330    360    310     61     86     39
 113 202211301158  10000 -99999   2000 -99999   3300    -41   -134     48  10341  10332      0 -99999 -99999    350     10    340     56     65     43    330    360    310     60     86     39
 113 202211301159  10000 -99999   2000 -99999   3300    -38   -130     49  10341  10332      0 -99999 -99999    350     10    320     56     68     43    330    360    310     59     86     39
 113 202211301200  10000 -99999   2000 -99999   3300    -40   -138     47  10340  10331      0 -99999 -99999    330    360    300     59     75     42    330    360    290     59     86     39
#7777END
```

이 형식에서는 **맨 마지막 데이터 행이 가장 최신 시각**인 경우가 일반적이므로,
현재 강수량을 표시하려면 다음 순서로 처리하면 된다.

1. `#`으로 시작하는 설명/주석 라인을 제외한다.
2. 실제 데이터 라인만 남긴다.
3. 마지막 데이터 라인을 선택한다.
4. 공백 기준으로 분리(split)한다.
5. 13번째 필드인 `RN` 값을 읽는다.
6. `0.1 mm` 단위로 변환하여 표시한다.

---

## 5. 현재 강수량 추출 로직

## 5.1 데이터 필드 순서

한 줄의 데이터는 아래 순서로 구성된다.

```text
S TM L_VIS R_VIS L_RVR R_RVR CH_MIN TA TD HM PS PA RN 예비1 예비2 WD02 WD02_MAX WD02_MIN WS02 WS02_MAX WS02_MIN WD10 WD10_MAX WD10_MIN WS10 WS10_MAX WS10_MIN
```

여기서 `RN`은 13번째 항목이지만,
프로그래밍에서 배열 인덱스를 사용할 경우 **0부터 시작하므로 index 12**이다.

예:

```text
113 202211301200 10000 -99999 2000 -99999 3300 -40 -138 47 10340 10331 0 -99999 -99999 330 360 300 59 75 42 330 360 290 59 86 39
```

배열로 나누면:

| index | 값 | 의미 |
|---|---:|---|
| 0 | 113 | 지점번호 |
| 1 | 202211301200 | 관측시각 |
| 2 | 10000 | 좌측 시정 |
| ... | ... | ... |
| 11 | 10331 | 현지기압 |
| 12 | 0 | 강수량 `RN` |

따라서 이 시각의 강수량은:

```text
0 / 10 = 0.0 mm
```

---

## 5.2 처리 절차

### 입력
- 조회 시각: `tm`
- 조회 구간: `dtm`
- 지점번호: `stn`
- 인증키: `authKey`

### 처리
1. API 호출
2. 응답 텍스트 수신
3. `#`으로 시작하는 줄 제거
4. 빈 줄 제거
5. 가장 마지막 데이터 행 선택
6. 공백 기준 분리
7. `fields[12]`를 `RN` 값으로 읽기
8. `RN == -99999` 이면 결측 처리
9. 그 외에는 `RN / 10.0` 하여 mm 단위로 변환
10. 화면에 표시

### 출력 예시
- `현재 강수량: 0.0 mm`
- `현재 강수량: 1.5 mm`
- `현재 강수량: 자료 없음`

---

## 6. 결측값 처리 규칙

이 API에서는 결측 또는 비정상 자료를 `-99999`로 표현하는 경우가 많다.
강수량도 동일하게 처리하는 것이 안전하다.

### 권장 규칙

| 원시값 | 해석 | 화면 표시 예시 |
|---|---|---|
| `-99999` | 결측 | `자료 없음` |
| `0` | 무강수 | `0.0 mm` |
| 양수 | 강수량 존재 | `값/10 mm` |

예:

- `RN = -99999` → `현재 강수량: 자료 없음`
- `RN = 0` → `현재 강수량: 0.0 mm`
- `RN = 7` → `현재 강수량: 0.7 mm`
- `RN = 23` → `현재 강수량: 2.3 mm`

---

## 7. 권장 메커니즘 설계

## 7.1 가장 단순한 구조

```text
[화면/대시보드]
      ↓
[백엔드 또는 스크립트]
      ↓
[KMA AMOS API 호출]
      ↓
[응답 텍스트 파싱]
      ↓
[최신 행의 RN 추출]
      ↓
[0.1 mm → mm 변환]
      ↓
[현재 강수량 표시]
```

## 7.2 동작 주기

현재 강수량 표시는 보통 **1분 주기 갱신**이 적절하다.

예:
- 매 1분마다 API 호출
- `tm`은 현재 KST 시각(분 단위)
- `dtm=5` 정도로 요청하여 최근 5분 범위 확보
- 마지막 행 기준으로 현재값 표시

이렇게 하면 단일 시각 자료 누락 시에도 직전 수 분 내 자료를 확보할 수 있다.

---

## 8. 예시 URL

### 인천공항(113)의 특정 시각 기준 최근 5분 조회

```text
https://apihub.kma.go.kr/api/typ01/url/amos.php?tm=202211301200&dtm=5&stn=113&help=1&authKey=YOUR_KEY
```

### 무안공항(163)의 현재 시각 기준 최근 10분 조회

```text
https://apihub.kma.go.kr/api/typ01/url/amos.php?dtm=10&stn=163&help=1&authKey=YOUR_KEY
```

`tm`을 생략하면 현재시각 기준으로 조회된다.

---

## 9. 구현 예시

## 9.1 JavaScript 예시

```javascript
async function fetchCurrentRainfall() {
  const authKey = 'YOUR_KEY';
  const stn = 113;
  const url = `https://apihub.kma.go.kr/api/typ01/url/amos.php?dtm=5&stn=${stn}&help=1&authKey=${authKey}`;

  const response = await fetch(url);
  const text = await response.text();

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  if (lines.length === 0) {
    return { rainfall: null, message: '자료 없음' };
  }

  const latest = lines[lines.length - 1];
  const fields = latest.split(/\s+/);

  const tm = fields[1];
  const rnRaw = Number(fields[12]);

  if (rnRaw === -99999 || Number.isNaN(rnRaw)) {
    return { tm, rainfall: null, message: '자료 없음' };
  }

  return {
    tm,
    rainfall: rnRaw / 10,
    message: `${(rnRaw / 10).toFixed(1)} mm`
  };
}
```

### 표시 예시

```javascript
fetchCurrentRainfall().then(data => {
  const target = document.getElementById('rainfall');
  target.textContent = `현재 강수량: ${data.message}`;
});
```

---

## 9.2 Python 예시

```python
import requests


def fetch_current_rainfall(auth_key, stn=113, dtm=5, tm=None):
    url = "https://apihub.kma.go.kr/api/typ01/url/amos.php"
    params = {
        "dtm": dtm,
        "stn": stn,
        "help": 1,
        "authKey": auth_key,
    }
    if tm:
        params["tm"] = tm

    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    text = resp.text

    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        lines.append(line)

    if not lines:
        return {
            "tm": None,
            "rainfall_mm": None,
            "display": "자료 없음"
        }

    latest = lines[-1]
    fields = latest.split()

    obs_tm = fields[1]
    rn_raw = int(fields[12])

    if rn_raw == -99999:
        rainfall_mm = None
        display = "자료 없음"
    else:
        rainfall_mm = rn_raw / 10.0
        display = f"{rainfall_mm:.1f} mm"

    return {
        "tm": obs_tm,
        "rainfall_mm": rainfall_mm,
        "display": display
    }
```

---

## 10. 화면 표출 규칙 예시

### 기본 문구

```text
현재 강수량: 0.0 mm
```

### 관측시각 포함

```text
현재 강수량(2022-11-30 12:00 KST): 0.0 mm
```

### 결측 시

```text
현재 강수량: 자료 없음
```

### 무강수 강조형

```text
현재 강수량: 없음 (0.0 mm)
```

---

## 11. 운영 시 유의사항

### 11.1 `RN`의 의미 확인
이 필드는 문서상 강수량(`0.1 mm`)으로 정의되어 있으나,
실제 운영에서는 다음을 별도로 확인하는 것이 좋다.

- 순간 강수량인지
- 최근 1분 누적량인지
- 특정 관측 주기 누적값인지

즉, **표시 목적이 “현재 비가 오느냐”인지, “누적 강수량”인지**에 따라 해석 문구를 조정할 필요가 있다.

### 11.2 최신 행 사용 원칙
`dtm=5` 또는 `dtm=10`으로 조회하면 여러 행이 반환될 수 있다.
이 경우 **가장 마지막 행**을 최신값으로 간주하는 방식이 가장 단순하고 실용적이다.

### 11.3 예외 처리
다음 경우를 대비해야 한다.

- API 응답 실패
- 인증키 오류
- 데이터 없음
- 결측값(`-99999`)
- 필드 개수 부족
- 네트워크 타임아웃

---

## 12. 권장 최종 로직

```text
1. stn, dtm, authKey를 이용해 API 호출
2. 응답 텍스트에서 주석(#) 제거
3. 실제 데이터 행만 추출
4. 마지막 행 선택
5. fields[12] = RN 값 추출
6. RN == -99999 이면 "자료 없음"
7. 아니면 RN / 10.0 → mm 변환
8. "현재 강수량: x.x mm" 형태로 표출
```

---

## 13. 한 줄 요약

이 API에서 현재 강수량은 **응답의 마지막 데이터 행에서 `RN` 필드(index 12)를 읽고, 이를 10으로 나누어 mm 단위로 표시**하면 된다.

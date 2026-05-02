# 낙뢰 데이터 설계문서

## 1. 개요

### 1.1 목적
낙뢰 데이터는 더 이상 "현재 시각 기준 최근 일부 strike 표시"에만 쓰지 않는다.

새 목표는 다음과 같다.

- 한반도 중심 단일 호출로 낙뢰를 수집한다.
- 5분 간격 스냅샷을 누적해 최근 4시간 낙뢰 히스토리를 유지한다.
- 지도에서 낙뢰 버튼을 켜면 기준 시각 대비 최근 60분 strike를 표시한다.
- 레이더 에코 루프를 재생하거나 시간을 이동하면, 그 프레임 시각 기준의 낙뢰 분포가 함께 바뀐다.
- Airport 모드의 8/16/32km zone 카운트도 동일한 기준 시각으로 다시 계산한다.

### 1.2 적용 범위

- 백엔드 수집:
  - `backend/src/processors/lightning-processor.js`
  - `backend/src/parsers/lightning-parser.js`
  - `backend/src/store.js`
- 서버 응답:
  - `server.js`
- 프론트 렌더링:
  - `frontend/src/components/InteractiveMap.jsx`
  - `frontend/src/utils/api.js`
- 알림 연동:
  - `frontend/src/utils/alerts/alert-triggers.js`

### 1.3 이전 구조와의 차이

기존 구조:

- 공항별로 낙뢰 API를 여러 번 호출
- 전국용 호출을 별도로 1회 더 수행
- `itv_minutes = 3`
- `latest.json`은 마지막 수집 결과 위주
- 지도는 `Date.now()` 기준 최근 30분 strike 표시

새 구조:

- 전국 1회 호출만 사용
- `itv_minutes = 5`
- 최근 4시간 strike를 `latest.json`에 누적 유지
- 지도는 레이더/위성 현재 프레임 시각 기준 최근 60분 strike 표시

---

## 2. API 수집

### 2.1 엔드포인트

- `config.api.lightning_url`
- 기본값:
  - `https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php`

### 2.2 요청 방식

백엔드는 공항별 반복 호출을 하지 않는다.
낙뢰는 전국 1회 호출만 사용한다.

기준 중심점:

- `lat = 36.2`
- `lon = 127.8`

반경:

- `range = 800km`

### 2.3 요청 파라미터

`buildNationwideLightningUrl()` 기준:

| 파라미터 | 값 |
|---|---|
| `tm` | 현재 시각 KST (`YYYYMMDDHHmm`) |
| `itv` | `config.lightning.itv_minutes` (기본 5) |
| `lon` | `config.lightning.nationwide.lon` |
| `lat` | `config.lightning.nationwide.lat` |
| `range` | `config.lightning.nationwide.range_km` (기본 800) |
| `gc` | `"T"` |
| `authKey` | `config.api.auth_key` |

### 2.4 폴링 주기

- `config.schedule.lightning_interval = "*/5 * * * *"`

### 2.5 설계 결정

- FIR polygon 필터는 적용하지 않는다.
- 원형 반경 `800km`만 사용한다.
- 따라서 인천 FIR 바깥 일부 strike가 함께 포함될 수 있다.
- 이는 누락 방지 우선 설계다.

---

## 3. 파싱

### 3.1 입력 유효성

`lightning-parser.js`:

- 응답에 `#START7777`와 `#7777END` 마커가 둘 다 없으면 에러
- 마커는 있으나 데이터 라인이 없으면 정상 0건 처리

### 3.2 라인 파싱

공백 분리 후 다음 필드 해석:

- `TM`
- `LON`
- `LAT`
- `ST`
- `T`
- `HT`

유효성:

- `TM`은 14자리 (`YYYYMMDDHHmmss`)
- `LON/LAT/ST`는 숫자
- `T`는 `G` 또는 `C`

### 3.3 시간 변환

- `time`: UTC ISO (`kstToUtcIso`)
- `time_kst`: KST ISO (`kstToKstIso`)

### 3.4 strike 공통 필드

파서 출력 strike 필드:

- `time`
- `time_kst`
- `lon`
- `lat`
- `intensity`
- `intensity_abs`
- `polarity`
- `type`
- `type_name`
- `height`

정렬:

- `time` 내림차순(최신 우선)

### 3.5 공항 zone 분류는 파서 이후 계산

기존처럼 파서 단계에서 "특정 공항 기준 8/16/32km 분류"를 확정하지 않는다.

이유:

- 원본 strike는 전국 1회 호출 결과를 재사용해야 한다.
- 공항별 zone 판정은 나중에 각 공항 기준으로 반복 계산할 수 있어야 한다.
- 동일 strike를 여러 공항에 대해 다시 분류할 수 있어야 한다.

즉 파서의 책임은 "원본 strike 표준화"까지만 둔다.

---

## 4. 누적 저장 모델

### 4.1 기본 원칙

낙뢰 `latest.json`은 단순 "마지막 1회 결과"가 아니라, 최근 4시간 히스토리를 유지하는 누적 상태 파일로 사용한다.

### 4.2 유지 기간

- 보존 창: 최근 `240분` (4시간)

이유:

- 레이더 루프 3시간
- 프레임 기준 최근 60분 낙뢰 표시
- `3시간 + 1시간 = 4시간`

### 4.3 누적 절차

매 5분 수집 시:

1. 전국 API에서 최근 5분 strike 수집
2. 이전 `latest.json`의 `nationwide.strikes` 로드
3. 새 strike와 기존 strike 병합
4. dedupe 수행
5. 기준 시각보다 240분 이상 오래된 strike 제거
6. 결과를 새 `latest.json`으로 저장

### 4.4 dedupe 규칙

동일 strike 판정 키:

- `time`
- `lat`
- `lon`
- `type`
- `intensity`

문자열 키 예:

```text
${time}|${lat}|${lon}|${type}|${intensity}
```

### 4.5 저장 envelope

예상 결과 구조:

```json
{
  "type": "lightning",
  "fetched_at": "...",
  "query": {
    "tm": "YYYYMMDDHHmm",
    "itv_minutes": 5,
    "nationwide_range_km": 800
  },
  "history_window_minutes": 240,
  "nationwide": {
    "summary": {
      "total_count": 0,
      "by_type": { "ground": 0, "cloud": 0 },
      "max_intensity": null,
      "latest_time": null
    },
    "strikes": []
  },
  "airports": {
    "RKSI": {
      "airport_name": "...",
      "arp": { "lat": 0, "lon": 0 },
      "summary": {
        "total_count": 0,
        "by_zone": { "alert": 0, "danger": 0, "caution": 0 },
        "by_type": { "ground": 0, "cloud": 0 },
        "max_intensity": null,
        "latest_time": null
      },
      "strikes": []
    }
  }
}
```

설명:

- `nationwide.strikes`는 최근 4시간 전체 raw strike 풀이다.
- `airports[*].strikes`는 같은 raw strike 풀에서 32km 이내만 필터한 파생 데이터다.
- Airport mode zone 카운트는 이 파생 strike로 계산한다.

### 4.6 파일 저장 방식

- `store.save("lightning", result)` 사용
- 파일:
  - `backend/data/lightning/latest.json`
  - `backend/data/lightning/LIGHTNING_YYYYMMDDTHHMMSSmmmZ.json`

이력 파일은 디버깅/복구용이고, 프론트 주 사용 대상은 `latest.json`이다.

---

## 5. 공항별 파생 계산

### 5.1 공항별 요약 계산 시점

백엔드 저장 직전에 전국 raw strike 풀을 기준으로 각 공항별 파생 데이터를 계산한다.

### 5.2 zone 판정

각 공항 ARP 기준 거리 계산 후:

- `<= 8km` => `alert`
- `<= 16km` => `danger`
- `<= 32km` => `caution`
- 그 외 제외

### 5.3 공항 payload 필드

- `airport_name`
- `arp`
- `summary`
- `strikes`

### 5.4 nationwide summary

전국 summary는 zone 없이 계산한다.

포함 필드:

- `total_count`
- `by_type`
- `max_intensity`
- `latest_time`

---

## 6. 실패 처리

### 6.1 전국 호출 실패

전국 1회 호출이 실패하면:

- 이전 `latest.json` 전체를 재사용
- 최상위 또는 `nationwide`/`airports`에 `_stale: true`를 붙인다

### 6.2 부분 실패 개념 제거

기존 공항별 개별 호출 구조가 사라지므로:

- `failedAirports`
- `airportErrors`

같은 공항별 부분 실패 모델은 제거하거나 축소한다.

### 6.3 저장 실패 정책

새 strike가 없어도:

- 기존 4시간 누적창을 trim한 결과가 변하면 저장
- 내용이 실질적으로 같으면 `latest.json`의 `fetched_at`만 갱신

---

## 7. 프론트 표출

### 7.1 기준 시각

낙뢰 표시 기준 시각 `referenceTime`은 다음 우선순위를 따른다.

1. 레이더 에코가 켜져 있고 현재 프레임이 있으면 `currentEchoFrame.tm`
2. 레이더가 없고 위성만 켜져 있으면 `currentSatFrame.tm`
3. 둘 다 없으면 `Date.now()`

### 7.2 시간 윈도우

낙뢰 버튼이 켜졌을 때 지도에는:

- `referenceTime - 60분 <= strike.time <= referenceTime`

범위의 strike만 표시한다.

### 7.3 렌더링 데이터 소스

지도용 원본은:

- `lightningData.nationwide.strikes`

공항 모드의 zone 카운트용 소스는:

- `lightningData.airports[selectedAirport].strikes`

### 7.4 레이더 루프 연동

레이더 프레임 이동 시:

- `referenceTime`이 바뀐다
- visible strikes가 다시 계산된다
- 마커 위치/개수/색이 함께 바뀐다
- Airport mode zone 카운트도 함께 바뀐다

### 7.5 마커 색상 규칙

색상은 `Date.now()`가 아니라 `referenceTime` 대비 경과시간으로 계산한다.

권장 단계:

- `0~10분`
- `10~20분`
- `20~30분`
- `30~40분`
- `40~50분`
- `50~60분`

즉 KMA 낙뢰영상처럼 "시간 구간별 색" 개념으로 본다.

### 7.6 범례

UI에는 시간대별 색 범례를 추가할 수 있다.

예:

- `Now ~ -10m`
- `-10m ~ -20m`
- `-20m ~ -30m`
- `-30m ~ -40m`
- `-40m ~ -50m`
- `-50m ~ -60m`

---

## 8. 알림 연동

### 8.1 원칙

알림은 "지도 렌더용 최근 60분 전체"가 아니라, 새로 유입된 strike 기준으로 판단해야 한다.

### 8.2 권장 방식

`lightning_detected`는:

- 최신 5분 수집분 중 신규 strike만 대상으로 삼는다
- 누적 4시간 창 전체를 기준으로 다시 알림 판단하지 않는다

즉 지도용 히스토리 모델과 알림용 신규 이벤트 모델을 분리한다.

### 8.3 영향

백엔드 누적 저장 구조로 바뀌더라도:

- 알림은 과거 strike 재노출 때문에 중복 발동하지 않아야 한다

---

## 9. TST1 오버레이

### 9.1 유지 정책

`/api/lightning` 응답 시 `mergeTst1(payload, "lightning")` 동작은 유지할 수 있다.

### 9.2 주의점

새 구조에서는 `airports.TST1`만 덮어쓰는 방식이 더 적합하다.

즉:

- nationwide raw strike 풀은 운영 데이터 유지
- `airports.TST1`만 테스트용으로 주입

---

## 10. 구현 체크리스트

| # | 항목 | 기대 결과 |
|---|---|---|
| 1 | `itv_minutes = 5` | 5분 수집과 API 조회 구간 일치 |
| 2 | 전국 1회 호출 | 공항별 중복 호출 제거 |
| 3 | `range_km = 800` | 인천 FIR 누락 가능성 최소화 |
| 4 | 4시간 누적 | 레이더 3시간 + 낙뢰 60분 재생 가능 |
| 5 | dedupe | 동일 strike 중복 저장 방지 |
| 6 | 공항별 파생 계산 | 8/16/32km 요약 유지 |
| 7 | 기준 시각 = 레이더 프레임 | 루프와 낙뢰 동기화 |
| 8 | 최근 60분 strike 표시 | KMA 낙뢰영상과 유사한 UX |
| 9 | 경과시간 색상 표시 | strike 시간대별 식별 가능 |
| 10 | Airport mode zone 카운트 동기화 | 프레임 시각 이동 시 카운트도 변경 |

---

## 11. 비목표

이번 설계에서 하지 않는 것:

- 인천 FIR polygon 필터
- 낙뢰 API의 공항별 개별 호출 유지
- `Date.now()` 기준 고정 30분 표시 유지
- strike 보간 또는 가짜 프레임 생성

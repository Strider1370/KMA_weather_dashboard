# Ground Forecast Design

`/ground` 모드에서 TAF 패널을 대체하는 7일 오전/오후 주간예보 기능 설계 메모.

## 목적

- 대상: 운항 담당자가 아닌 일반 공항 종사자
- 표시: 선택 공항 기준 7일 예보
- 구조: 날짜별 오전/오후 날씨, 강수확률, 최고/최저 기온

## 데이터 소스

- 단기육상예보: `VilageFcstMsgService/getLandFcst`
- 중기육상예보: `MidFcstInfoService/getMidLandFcst`
- 중기기온예보: `MidFcstInfoService/getMidTa`
- 인증키: 기존 `API_AUTH_KEY` 재사용

## 공항별 regId 매핑

중기육상예보는 광역 A코드, 중기기온예보는 도시 C코드를 분리한다.

| ICAO | short regId | mid land regId | mid temp regId |
| --- | --- | --- | --- |
| RKSS | 11B20102 | 11B00000 | 11B20102 |
| RKSI | 11B20201 | 11B00000 | 11B20201 |
| RKPC | 11G00201 | 11G00000 | 11G00201 |
| RKJY | 11F20401 | 11F20000 | 11F20401 |
| RKJB | 21F20804 | 11F20000 | 21F20804 |
| RKPU | 11H20101 | 11H20000 | 11H20101 |
| RKNY | 11D20403 | 11D20000 | 11D20403 |
| RKPK | 11H20304 | 11H20000 | 11H20304 |

## 스케줄

통합 수집기 하나로 운용한다.

- cron: `30 6,11,18,23 * * *`

의도:

- `06:30`: 단기 05시 + 중기 06시 반영
- `11:30`: 단기 11시 반영
- `18:30`: 단기 17시 + 중기 18시 반영
- `23:30`: 단기 23시 반영

## tmFc 규칙

- 단기육상예보: `tmFc` 없이 최신 발표본 사용
- 중기예보: KST 기준 최근 발표본 사용
- 발표 후 30분 전에는 직전 발표본 유지

중기 기준:

- `06:30` 이전: 전일 `18:00`
- `06:30` 이상 `18:30` 미만: 당일 `06:00`
- `18:30` 이상: 당일 `18:00`

## 결합 규칙

- 단기 데이터로 `D+0 ~ D+3` 구성
- 중기 데이터로 `D+4 ~ D+6` 구성
- `D+3 ~ D+4` 경계가 겹치면 단기 우선
- 결과는 공항별 7일 배열로 정렬

통합 day 구조:

```json
{
  "date": "2026-04-03",
  "dayOfWeek": "목",
  "isToday": true,
  "am": {
    "weather": "맑음",
    "weatherCode": "DB01",
    "rainProb": 20,
    "icon": "sunny"
  },
  "pm": {
    "weather": "구름많고 비",
    "weatherCode": "DB03",
    "rainProb": 60,
    "icon": "rain"
  },
  "tempMin": 8,
  "tempMax": 22,
  "source": "short"
}
```

## 저장 구조

- 저장 타입: `ground_forecast`
- 파일: `backend/data/ground_forecast/latest.json`
- payload는 공항별 맵 구조 사용

예시:

```json
{
  "type": "ground_forecast",
  "fetched_at": "2026-04-03T02:30:00.000Z",
  "airports": {
    "RKSI": {
      "icao": "RKSI",
      "forecast": [],
      "source_status": {
        "short": { "ok": true },
        "mid_land": { "ok": true, "tmFc": "202604030600" },
        "mid_ta": { "ok": true, "tmFc": "202604030600" }
      }
    }
  }
}
```

## 실패 대응

- API는 소스별 독립 실패 처리
- 일부 소스만 실패해도 가능한 범위는 새로 조합
- 이전 성공 데이터가 있으면 비어 있는 구간 보강
- 새 결과가 이전보다 커버리지가 크게 나빠지면 기존 값을 유지
- 전체 실패면 기존 `latest.json` 유지
- 프론트가 상태를 표시할 수 있도록 `source_status` 포함

품질 기준:

- 최소한 일부 유효 일자라도 생성되면 후보 payload로 본다
- 이전 payload보다 커버리지가 감소했고 동시에 소스 실패가 있었으면 이전 payload 우선 유지

## 현재 프로젝트에 맞춘 제약

- TTL 캐시 중심 구조는 도입하지 않는다
- 기존 저장 모델인 `latest.json + content_hash`를 유지한다
- 프론트는 기존 `/api/snapshot-meta` 폴링 구조에 붙인다
- 백엔드는 CommonJS, 프론트는 ESM 규칙을 유지한다

## 구현 순서

1. `config.js`에 주간예보 설정과 regId 매핑 추가
2. `ground-forecast-processor.js` 추가
3. `store`, `index`, `run-once`, `server.js`에 타입 등록
4. `/api/ground-forecast`와 `snapshot-meta` 연결
5. `/ground`에서 `TafTimeline` 대신 새 패널 렌더링

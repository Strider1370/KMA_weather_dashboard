1. 목표

SIGMET / AIRMET 정보를 KMA API에서 주기적으로 수집하고, IWXXM XML을 파싱해 `backend/data/` 아래 JSON으로 저장한 뒤, 지도 패널에서 토글 버튼으로 표시한다.

최종 동작은 다음과 같다.

- 백엔드가 SIGMET / AIRMET API를 주기적으로 호출한다.
- XML을 지도용 JSON 구조로 정규화한다.
- `latest.json`과 이력 파일을 기존 수집기 패턴대로 저장한다.
- `content_hash`를 계산해 `/api/snapshot-meta` 변경 감지에 포함한다.
- 프론트는 snapshot 비교 후 변경 시만 `/api/sigmet`, `/api/airmet`를 다시 가져온다.
- 지도 패널에서 `SIGMET`, `AIRMET` 버튼을 누르면 다각형 오버레이가 지도 위에 표시된다.

2. 데이터 소스

SIGMET API:

`/api/typ02/openApi/AmmIwxxmService/getSigmet`

AIRMET API:

`/api/typ02/openApi/AmmIwxxmService/getAirmet`

주의:

- 실제 호출 시 `authKey`는 문서에 하드코딩하지 않고 `.env`의 `API_AUTH_KEY`를 재사용한다.
- `pageNo`, `numOfRows`, `dataType=XML` 파라미터는 기존 typ02 API 패턴과 동일하게 구성한다.
- KMA 응답은 `response > body > items > item > sigmetMsg/airmetMsg` 내부에 IWXXM XML 문자열이 들어 있는 형태를 전제로 한다.

3. 이 샘플 XML로 가능한 것

제공된 SIGMET 샘플에서 이미 다음 필드가 확인되었다.

- 현상: `iwxxm:phenomenon`
- 유효기간: `iwxxm:validPeriod`
- 발행시각: `iwxxm:issueTime`
- 고도: `aixm:lowerLimit`, `aixm:upperLimit`
- 영역 좌표: `gml:posList`
- 시퀀스 번호: `iwxxm:sequenceNumber`
- 상태: `reportStatus`

즉 첫 구현을 시작하기 위한 예시로는 충분하다.

향후 추가 확인이 필요한 변형 케이스:

- 여러 개 item이 한 번에 오는 경우
- `CNL` / `AMD` 메시지
- polygon이 아닌 forecast geometry 또는 FIR 전체 범위 표현
- 여러 개 analysis member를 가지는 경우

4. 필요한 최종 정보

지도 오버레이 기준으로 SIGMET / AIRMET에서 최소한 필요한 정보는 다음과 같다.

- 식별자
  - 고유 ID
  - sequence number
  - ATSU / MWO / FIR
- 시간
  - issue time
  - valid from
  - valid to
  - time indicator (`OBSERVATION` / `FORECAST`)
- 현상
  - phenomenon code (`SEV_ICE`, `SEV_TURB`, `TS`, `MT_OBSC`, etc.)
  - phenomenon label
  - intensity change
- 고도
  - lower limit
  - upper limit
  - 각 limit의 reference / unit
- 기하 정보
  - polygon 좌표
  - 필요 시 bbox
- 수명 주기
  - report status (`NORMAL`, `AMENDMENT`, `CANCELLATION`)
  - cancelled target reference

5. 백엔드 구조 계획

5-1. 추가 파일

신규 파일:

- `backend/src/processors/sigmet-processor.js`
- `backend/src/processors/airmet-processor.js`
- `backend/src/parsers/sigmet-parser.js`
- `backend/src/parsers/airmet-parser.js`

수정 파일:

- `backend/src/config.js`
- `backend/src/store.js`
- `backend/src/index.js`
- `server.js`

5-2. config 확장

`backend/src/config.js`에 다음을 추가한다.

- `api.endpoints.sigmet = "/AmmIwxxmService/getSigmet"`
- `api.endpoints.airmet = "/AmmIwxxmService/getAirmet"`
- `schedule.sigmet_interval`
- `schedule.airmet_interval`

권장 주기:

- SIGMET: `*/5 * * * *`
- AIRMET: `*/5 * * * *`

이유:

- SIGMET / AIRMET은 정기 시보형보다는 필요 시 발행이므로 polling이 필요하다.
- 이 프로젝트의 다른 위험 기상 계열(`warning`, `lightning`)도 5분 주기를 사용 중이어서 운영 일관성이 좋다.

5-3. store 확장

`backend/src/store.js`에 다음 타입을 추가한다.

- `sigmet`
- `airmet`

함께 확장할 것:

- `TYPES`
- `FILE_PREFIX`
- `cache`

예상 저장 경로:

- `backend/data/sigmet/latest.json`
- `backend/data/airmet/latest.json`

이력 파일 예시:

- `backend/data/sigmet/SIGMET_20260323T090000000Z.json`
- `backend/data/airmet/AIRMET_20260323T090000000Z.json`

기존과 동일하게 `content_hash` 기반 저장/미저장 판단을 사용한다.

5-4. processor 역할

각 processor는 다음 역할을 담당한다.

- KMA API 호출
- XML 파싱
- 정규화 JSON 생성
- 만료/취소/수정 처리
- `store.save(type, result)` 호출

`process()` 결과에는 최소 다음을 포함한다.

- fetched_at
- item count
- saved 여부
- stale / cancel / parse error count

5-5. parser 역할

각 parser는 다음을 담당한다.

- outer XML에서 `item` 배열 추출
- `sigmetMsg` 또는 `airmetMsg` 내부 IWXXM XML 문자열 파싱
- 각 IWXXM report를 normalized item으로 변환
- `gml:posList`를 GeoJSON 좌표 배열로 변환
- `Lat Lon` 순서를 GeoJSON 표준인 `[lon, lat]`로 뒤집기
- polygon 닫힘 보정

6. JSON 구조 제안

`backend/data/sigmet/latest.json` 예시:

```json
{
  "type": "sigmet",
  "fetched_at": "2026-03-23T09:01:12Z",
  "items": [
    {
      "id": "RKSI-C01-2026-03-23T09:00:00Z",
      "sequence_number": "C01",
      "report_status": "NORMAL",
      "cancelled": false,
      "issue_time": "2026-03-23T09:00:00Z",
      "valid_from": "2026-03-23T09:00:00Z",
      "valid_to": "2026-03-23T12:49:00Z",
      "fir": "RKSI",
      "atsu": "RKSI",
      "mwo": "RKSI",
      "phenomenon_code": "SEV_ICE",
      "phenomenon_label": "Severe Icing",
      "time_indicator": "OBSERVATION",
      "intensity_change": "NO_CHANGE",
      "altitude": {
        "lower_fl": 90,
        "upper_fl": 190,
        "lower_ref": "STD",
        "upper_ref": "STD"
      },
      "motion": {
        "direction_deg": 0,
        "speed_kt": 0
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [124.000001907, 30.0000019070001],
            [125.416666031, 30.0000019070001],
            [126.833333969, 32.5000019070001],
            [127.500001907, 32.5000019070001],
            [128.74222126446892, 34.114887640249435],
            [124.000001907, 34.48184509052976],
            [124.000001907, 30.0000019070001]
          ]
        ]
      },
      "raw_xml_id": "uuid.7f5dbffc-6d19-4a07-9557-4efbc3e20cbb"
    }
  ],
  "content_hash": "sha256..."
}
```

AIRMET도 같은 구조를 쓰되 `type: "airmet"`와 현상 코드만 달라지게 한다.

권장 필드:

- 공통 메타: `type`, `fetched_at`, `items`, `content_hash`
- item 메타: `id`, `sequence_number`, `report_status`, `cancelled`
- 시간: `issue_time`, `valid_from`, `valid_to`
- 현상: `phenomenon_code`, `phenomenon_label`, `time_indicator`, `intensity_change`
- 고도: `altitude`
- 이동: `motion`
- 도형: `geometry`

7. 취소 / 수정 / 만료 처리 규칙

7-1. 만료

- `valid_to < now`이면 백엔드에서 제거한다.
- 프론트에는 현재 유효한 item만 넘긴다.

7-2. 취소 (`CNL`)

- `CANCELLATION` 보고서는 자체 polygon 없이 참조만 가질 수 있다.
- 프론트에 cancellation item 자체를 보여주지 않는다.
- 대신 latest active set 구성 단계에서 대상 SIGMET/AIRMET를 제거한다.

7-3. 수정 (`AMD`)

- 기존 식별자를 대체하는 item으로 간주한다.
- latest active set에서는 최신 amendment만 남긴다.

8. 서버/API 계획

`server.js`에 다음 API를 추가한다.

- `/api/sigmet`
- `/api/airmet`

각 route는 기존 `readLatest("metar")` 패턴과 동일하게 `readLatest("sigmet")`, `readLatest("airmet")`를 사용한다.

`/api/snapshot-meta` 응답도 확장한다.

예시:

```json
{
  "metar": { "hash": "..." },
  "taf": { "hash": "..." },
  "warning": { "hash": "..." },
  "lightning": { "hash": "..." },
  "adsb": { "hash": "..." },
  "sigmet": { "hash": "..." },
  "airmet": { "hash": "..." },
  "echo": { "tm": "..." }
}
```

9. 프론트 데이터 로딩 계획

수정 대상:

- `frontend/src/utils/api.js`
- `frontend/src/App.jsx`

9-1. `utils/api.js`

`loadAllData()`에 추가:

- `/api/sigmet`
- `/api/airmet`

`loadChangedData()`에 추가:

- `changes.sigmet`
- `changes.airmet`

9-2. `App.jsx`

snapshot 관리에 추가:

- `snapshotHashRef.current.sigmet`
- `snapshotHashRef.current.airmet`

polling 비교 로직에 추가:

- `snapshot.sigmet.hash !== saved.sigmet`
- `snapshot.airmet.hash !== saved.airmet`

그리고 `InteractiveMap` props에 다음을 전달한다.

- `sigmetData={data.sigmet}`
- `airmetData={data.airmet}`

10. 지도 UI / UX 계획

10-1. 버튼

`InteractiveMap` 상단 기존 버튼 줄에 다음 토글 버튼을 추가한다.

- `SIGMET`
- `AIRMET`

버튼 규칙:

- 다중 선택 가능
- 기본값은 OFF
- `SIGMET`, `AIRMET`는 `Radar`, `Lightning`, `Traffic`와 동일한 UX 톤 유지

10-2. 다각형 표시 방식

지도 위에는 polygon을 직접 그리고, polygon 내부 중심점 부근에 phenomenon 아이콘을 표시한다.

표시 규칙:

- polygon 외곽선은 항상 보인다
- polygon 내부 fill은 기본적으로 약한 투명도만 준다
- polygon 중심부에 현상별 아이콘 배치
- zoom이 너무 작을 때는 아이콘만 간단화하거나 생략 가능

phenomenon 아이콘 예시:

- `SEV_ICE` -> 얼음/착빙 아이콘
- `SEV_TURB` -> 난기류 아이콘
- `TS` -> 뇌전 아이콘
- `VA` -> 화산재 아이콘
- `MT_OBSC` -> 산악 은폐 아이콘

첫 버전에서는 SVG/emoji/divIcon 기반 단순 아이콘으로 시작하는 것이 현실적이다.

10-3. hover 동작

사용자가 polygon 위에 커서를 올리면 다음 동작을 한다.

- polygon fill 색을 더 진하게 변경
- 외곽선 두께를 증가
- tooltip 표시

tooltip 내용:

- 현상명
- 유효기간 (`valid_from ~ valid_to`)
- 고도 범위 (`FL090 ~ FL190`)
- sequence number
- 필요 시 상태 (`OBS`, `FCST`, `NO_CHANGE`)

10-4. 스타일 제안

SIGMET / AIRMET 공통:

- stroke는 선명하게
- fill은 낮은 opacity
- hover 시 fill opacity 상승

구분:

- SIGMET: 더 강한 색 / 더 두꺼운 외곽선
- AIRMET: 더 얇은 외곽선 / 더 옅은 fill

현상별 색 제안:

- `SEV_ICE`: cyan / light blue 계열
- `SEV_TURB`: orange 계열
- `TS`: red 계열
- `VA`: dark gray / purple 계열

11. 지도 구현 방식 제안

현재 `InteractiveMap.jsx`는 이미 `Polygon`, `GeoJSON`, `Pane`, tooltip 패턴을 사용할 수 있는 구조다.

권장 구현:

- `sigmetData.items`와 `airmetData.items`를 `Polygon` 배열로 렌더링
- 각 item에 대해 center point 계산
- center에 phenomenon 아이콘용 `Marker` 또는 `divIcon` 렌더링
- polygon `eventHandlers`로 hover state 처리

구현 단위는 다음처럼 쪼개는 것이 좋다.

- `buildSigmetLatLngs(item.geometry)`
- `getPhenomenonStyle(item, isHovered)`
- `getPhenomenonIcon(item)`
- `SigmetAirmetOverlay` 서브컴포넌트

12. 검증 계획

백엔드 검증:

- SIGMET / AIRMET API 호출 성공 여부
- `latest.json` 생성 확인
- 동일 payload 시 `content_hash` 유지 확인
- payload 변경 시 이력 파일 저장 확인
- `CNL`, `AMD`, 만료 처리 확인

서버 검증:

- `/api/sigmet`
- `/api/airmet`
- `/api/snapshot-meta`

프론트 검증:

- `SIGMET` 버튼 ON/OFF
- `AIRMET` 버튼 ON/OFF
- polygon hover 시 강조
- tooltip 내용 확인
- zoom level에 따른 아이콘 가독성 확인

13. 구현 순서

권장 순서:

1. `config/store/index/server`에 새 타입 추가
2. `sigmet-parser.js`, `airmet-parser.js` 작성
3. `sigmet-processor.js`, `airmet-processor.js` 작성
4. `snapshot-meta` / `/api/sigmet` / `/api/airmet` 연결
5. `frontend/src/utils/api.js`, `frontend/src/App.jsx` polling 확장
6. `InteractiveMap`에 버튼 / polygon / tooltip / icon 추가
7. 실제 API 샘플 다건 테스트

14. 주의사항

- `gml:posList` 좌표 순서를 반드시 확인할 것
- GeoJSON은 `[lon, lat]`
- polygon이 닫히지 않으면 마지막 점을 첫 점과 같게 보정할 것
- hover 시 fill 강조가 지나치면 레이더/낙뢰 시인성을 해칠 수 있으므로 opacity는 낮게 유지할 것
- 취소/수정/만료 처리는 프론트가 아니라 백엔드 latest 구성에서 정리할 것

15. 결론

SIGMET / AIRMET은 현재 프로젝트 구조에 자연스럽게 추가할 수 있다.

핵심은 다음 세 가지다.

- 백엔드에서 IWXXM XML을 지도용 JSON으로 정규화할 것
- 기존 `latest.json + content_hash + snapshot-meta` 패턴에 완전히 맞출 것
- 지도에서는 버튼 토글, polygon, 내부 phenomenon 아이콘, hover 강조 + tooltip 조합으로 표현할 것

이 설계 기준이면 기존 METAR / TAF / Warning / Lightning / Radar / ADS-B 흐름을 해치지 않고 SIGMET / AIRMET를 확장할 수 있다.

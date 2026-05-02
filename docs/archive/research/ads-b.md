1. API 주소

OpenSky Network에서 제공하는 항공기 상태 정보 API를 사용한다.

https://opensky-network.org/api/states/all?lamin=33&lomin=124&lamax=39&lomax=132

이 API는 **특정 위도·경도 영역 안에 있는 모든 항공기의 상태(state vector)**를 반환한다.

파라미터 의미:

lamin : 최소 위도

lamax : 최대 위도

lomin : 최소 경도

lomax : 최대 경도

위 주소는 다음 영역을 의미한다.

위도: 33° ~ 39°

경도: 124° ~ 132°

즉 대한민국 및 주변 공역을 러프하게 포함하는 영역이다.

2. API 데이터 소스 개요

OpenSky Network는 전 세계에 설치된 ADS-B 수신기 네트워크를 통해 항공기에서 송신되는 ADS-B / Mode-S 트랜스폰더 신호를 수집한다.

항공기는 자신의 위치와 상태를 지속적으로 송신하며, 주요 정보는 다음과 같다.

항공기 식별 코드

위치 (위도, 경도)

고도

속도

진행 방향

상승/하강률

이 API는 해당 정보를 일정 시점 기준으로 묶어 state vector 형태로 제공한다.

응답 구조는 다음과 같다.

{
  "time": 현재 데이터 시각,
  "states": [
    [항공기1 상태],
    [항공기2 상태],
    ...
  ]
}

time : 데이터 생성 시각 (Unix timestamp)

states : 항공기 상태 목록

states 배열의 각 항목은 항공기 한 대의 상태를 의미한다.

3. State Vector 인덱스 구조

각 항공기 데이터는 배열 형태로 제공되며, 주요 인덱스는 다음과 같다.

인덱스	필드	의미
0	icao24	항공기 트랜스폰더 ICAO 24bit 주소
1	callsign	항공편 호출부호
2	origin_country	등록 국가
3	time_position	위치 정보 갱신 시각
4	last_contact	마지막 신호 수신 시각
5	longitude	경도
6	latitude	위도
7	baro_altitude	기압 고도
8	on_ground	지상 여부
9	velocity	속도
10	true_track	진행 방향 (deg)
11	vertical_rate	상승/하강률
12	sensors	센서 정보
13	geo_altitude	기하학적 고도
14	squawk	트랜스폰더 코드
15	spi	특수 상태 표시
16	position_source	위치 정보 출처
4. 지도 표시에 사용할 데이터

본 시스템에서는 항공기를 지도 위에 표시하기 위해 다음 최소 필드만 사용한다.

위치 표시

latitude (index 6)

longitude (index 5)

→ 지도 위 항공기 위치 표시

항공기 방향

true_track (index 10)

→ 비행기 아이콘 회전 방향

항공기 식별 (선택)

icao24 (index 0)

callsign (index 1)

→ 마커 식별 또는 라벨 표시

5. 지도 표시 방식

API에서 받은 데이터 중 다음 조건을 만족하는 항공기만 지도에 표시한다.

latitude와 longitude 값이 존재하는 항공기

Bounding Box 영역 내부 항공기

필요 시 on_ground 항공기 제외 가능

지도 표시 시 동작 방식:

위도/경도를 이용해 지도 위 위치 결정

비행기 아이콘을 마커로 표시

true_track 값을 이용해 아이콘을 해당 방향으로 회전

icao24을 기준으로 항공기 객체를 식별

일정 주기로 API를 호출하여 위치 갱신

6. 요약

본 시스템은 OpenSky Network의 항공기 상태 API를 이용하여 대한민국 주변 공역에 있는 항공기의 실시간 위치 정보를 수집하고 지도에 표시하는 것을 목표로 한다.

핵심 데이터는 다음 세 가지이다.

위도(latitude)

경도(longitude)

진행 방향(true_track)

이를 이용하여 지도 위에 회전 가능한 항공기 아이콘 형태로 항공기를 시각화할 수 있다.

원하면 내가 추가로 **지도 표시 구현에서 실제로 많이 쓰는 구조 (예: aircraft 객체 구조)**도 한 페이지 정도로 정리해 줄게.
그거 있으면 바로 구현 들어가기 편하다.



# ADS-B + 공항공사 API 연동 정리

## 1. 목표

OpenSky(또는 ADS-B 수신 데이터)로 실시간 항적을 표시하면서, 각 항적에 다음 정보를 붙여서 사이트에 표시한다.

- 출발 공항
- 도착 공항
- 기종
- 기종에 따른 아이콘 크기 차등 표시

## 2. 기본 개념

### OpenSky / ADS-B 쪽에서 얻는 정보
주로 얻는 값:
- callsign (예: `KAL006`, `JJA2104`)
- icao24
- 위도/경도
- 고도
- 속도
- 진행방향

주의:
- 모든 항공기가 항상 callsign을 보내는 것은 아님
- 보내더라도 항상 동일한 형식은 아님
- 일반적으로 항공사 정기편은 ICAO 3-letter 형식 (`KAL006`, `JJA2104`)이 많음
- 일부는 등록번호 기반으로 보일 수 있음

## 3. 편명 / 콜사인 관계

### IATA 편명
승객이나 공항 전광판에서 많이 보는 형식
- `KE006`
- `7C2104`
- `OZ741`

### ICAO callsign / flight identification
ADS-B, 비행계획, ATC 쪽에서 자주 보는 형식
- `KAL006`
- `JJA2104`
- `AAR741`

즉 보통은:
- `KE006` ↔ `KAL006`
- `7C2104` ↔ `JJA2104`
- `OZ741` ↔ `AAR741`

다만 항상 100% 일치한다고 단정하면 안 되고, 예외를 고려해야 한다.

## 4. 사용하려는 API 구성

전국 공항 기준으로 사용할 예정인 API는 다음 3개.

### 4.1 한국공항공사 API 1
**한국공항공사_항공기 운항정보**
- 공항코드정보
- 국내선 운항스케줄
- 국제선 운항스케줄
- 실시간 운항정보

용도:
- 편명
- 출발공항 / 도착공항
- 시간 / 상태

참고:
- 실제 호출 시 `NO OPENAPI SERVICE ERROR`가 발생해서 현재 즉시 사용 가능 여부는 불확실
- 포털상으론 서비스가 존재하지만, 실제 게이트웨이 동작 여부는 별도 확인 필요

### 4.2 한국공항공사 API 2
**전국공항 실시간 항공기 기종 및 등록번호 정보**  
(인천국제공항 제외)

용도:
- 편명
- 출발공항 / 도착공항
- 항공기 등록번호
- 항공기 기종

핵심 포인트:
- 이 API는 `schFln`(편명)이 옵션
- 즉 편명을 꼭 넣지 않아도 됨
- 공항코드 + 시간 범위로 목록 조회 가능
- 응답에 기종 코드와 등록번호가 들어옴

주의:
- 이 API도 실제 호출 시 `NO OPENAPI SERVICE ERROR`가 발생했음
- 포털 설명과 실제 서비스 상태가 다를 수 있음
- 나중에 다시 검증 필요

### 4.3 인천국제공항공사 API
**항공기 운항 현황 상세 조회**

용도:
- 편명 (`flightId`)
- 출발/도착 상대 공항 (`airportCode`, `airport`)
- 기종 (`aircraftSubtype`)
- 등록번호 (`aircraftRegNo`)
- 예정/변경 시각

인천공항 전용이며 실제 응답 확인 완료.

응답 예시 필드:
- `flightId`: `KE006`
- `airportCode`: `LAS`
- `airport`: `라스베이거스`
- `aircraftSubtype`: `77W`
- `aircraftRegNo`: `HL8041`

## 5. 실제 호출 주소 정리

## 5.1 한국공항공사 API 1 - 실시간 운항정보
문서상 Call Back URL:
`http://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList`

실사용 시도 주소(HTTPS):
```text
https://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList?serviceKey=YOUR_ENCODED_KEY&schStTime=0000&schEdTime=2359&schLineType=D&schIOType=O&schAirCode=GMP&pageNo=1
```

예시:
- 김포 국내선 출발
```text
https://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList?serviceKey=YOUR_ENCODED_KEY&schStTime=0000&schEdTime=2359&schLineType=D&schIOType=O&schAirCode=GMP&pageNo=1
```

- 김포 국내선 도착
```text
https://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList?serviceKey=YOUR_ENCODED_KEY&schStTime=0000&schEdTime=2359&schLineType=D&schIOType=I&schAirCode=GMP&pageNo=1
```

- 김해 국제선 출발
```text
https://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList?serviceKey=YOUR_ENCODED_KEY&schStTime=0000&schEdTime=2359&schLineType=I&schIOType=O&schAirCode=PUS&pageNo=1
```

- 제주 국내선 출발
```text
https://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList?serviceKey=YOUR_ENCODED_KEY&schStTime=0000&schEdTime=2359&schLineType=D&schIOType=O&schAirCode=CJU&pageNo=1
```

주의:
- 문서에는 HTTP로 적혀 있으나, 실제 시도는 HTTPS로 진행했음
- 현재 테스트에서는 `NO OPENAPI SERVICE ERROR` 발생

## 5.2 한국공항공사 API 2 - 기종 및 등록번호 포함 운항정보
서비스명: 전국공항 실시간 항공기 기종 및 등록번호 정보  
문서/포털 기준 오퍼레이션명: `getFlightStatusAPLList`

실사용 시도 주소(HTTPS):
```text
https://openapi.airport.co.kr/service/rest/FlightStatusAPLList/getFlightStatusAPLList?serviceKey=YOUR_ENCODED_KEY&pageNo=1&numOfRows=200&schStTime=0000&schEdTime=2359&schAirCode=GMP
```

예시:
- 김포 당일 전체
```text
https://openapi.airport.co.kr/service/rest/FlightStatusAPLList/getFlightStatusAPLList?serviceKey=YOUR_ENCODED_KEY&pageNo=1&numOfRows=200&schStTime=0000&schEdTime=2359&schAirCode=GMP
```

- 무안 당일 전체
```text
https://openapi.airport.co.kr/service/rest/FlightStatusAPLList/getFlightStatusAPLList?serviceKey=YOUR_ENCODED_KEY&pageNo=1&numOfRows=200&schStTime=0000&schEdTime=2359&schAirCode=MWX
```

- 제주 당일 전체
```text
https://openapi.airport.co.kr/service/rest/FlightStatusAPLList/getFlightStatusAPLList?serviceKey=YOUR_ENCODED_KEY&pageNo=1&numOfRows=200&schStTime=0000&schEdTime=2359&schAirCode=CJU
```

주의:
- `schFln`은 옵션이므로 생략 가능
- 현재 테스트에서는 이것도 `NO OPENAPI SERVICE ERROR` 발생

## 5.3 인천국제공항공사 API - 출발
문서상 Call Back URL:
```text
http://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp
```

오늘 하루치(예시 날짜 20260327):
```text
http://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp?serviceKey=YOUR_ENCODED_KEY&searchDate=20260327&searchFrom=0000&searchTo=2400&searchdtCode=E&pageNo=1&numOfRows=1000&type=xml
```

## 5.4 인천국제공항공사 API - 도착
문서상 Call Back URL:
```text
http://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltArrivalsDeOdp
```

오늘 하루치(예시 날짜 20260327):
```text
http://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltArrivalsDeOdp?serviceKey=YOUR_ENCODED_KEY&searchDate=20260327&searchFrom=0000&searchTo=2400&searchdtCode=E&pageNo=1&numOfRows=1000&type=xml
```

## 5.5 실제 사용할 때 바꿔야 할 값
- `YOUR_ENCODED_KEY` → 본인 Encoding 인증키
- `searchDate` → 조회 날짜 (`YYYYMMDD`)
- `schAirCode` → 공항코드 (예: `GMP`, `PUS`, `CJU`, `MWX`)
- `schLineType`
  - `D` = 국내선
  - `I` = 국제선
- `schIOType`
  - `O` = 출발
  - `I` = 도착

## 6. 기종 정보 해석

인천공항공사 API의 기종 필드는 풀네임이 아니라 subtype 코드로 들어옴.

예시:
- `77W` = Boeing 777-300ER
- `32Q` = Airbus A321neo
- `7M8` = Boeing 737 MAX 8
- `320` = Airbus A320

즉 `aircraftSubtype`가 기종 필드라고 보면 됨.

사이트에서는:
- 그대로 코드만 써도 되고
- 백엔드에서 풀네임으로 바꿔도 됨
- 아이콘 크기만 바꿀 목적이라면 코드만으로도 충분함

## 7. 코드셰어 처리

인천공항공사 응답 예시에서:
- `codeshare = Master`
- `codeshare = Slave`
- `masterFlightId = KE006`

처럼 들어오는 경우가 있음.

예:
- `KE006` = Master
- `DL7832` = Slave
- `masterFlightId = KE006`

권장 처리:
- Master 편명을 대표 키로 사용
- Slave 편명은 alias처럼 처리

예:
```json
{
  "DL7832": {
    "aliasOf": "KE006"
  }
}
```

## 8. 전체 메커니즘

### 8.1 OpenSky / ADS-B
- 일정 주기로 실시간 항적 수집
- callsign, 위치, 방향 등을 저장

### 8.2 공항공사 API
- 일정 주기로 운항정보 수집
- 출도착공항, 기종, 등록번호 등을 저장

### 8.3 백엔드 처리
- 공항공사 API 응답을 가공
- 편명 기준 lookup table 또는 JSON 생성
- OpenSky callsign과 매칭
- 프론트에 표시용 최종 데이터 전달

### 8.4 프론트엔드
프론트는 매칭을 하지 않고, 표시만 담당:
- 비행기 위치 표시
- 진행방향 반영
- 기종에 따라 아이콘 크기 변경
- 출발/도착공항 툴팁 표시

즉:
**매칭은 백엔드에서 끝내고, 프론트는 렌더링만 하는 구조가 좋음**

## 9. 저장 방식 권장안

공항공사 API 응답을 백엔드에서 가공해서 JSON으로 저장하고, 동시에 메모리에 올려서 lookup map으로 사용

예:
- `data/iiac_arrivals_20260327.json`
- `data/iiac_departures_20260327.json`
- `data/kac_flightstatus_20260327.json`
- `data/kac_apl_20260327.json`

그리고 서버 내부에서는:
- 파일 저장
- 메모리 Map 로드
- 실시간 매칭 시 메모리 Map 참조

즉:
- 디스크 JSON = 백업/디버깅용
- 메모리 Map = 실시간 매칭용

## 10. JSON 가공 예시

```json
{
  "KAL006": {
    "flightId": "KE006",
    "dep": "LAS",
    "arr": "ICN",
    "aircraftSubtype": "77W",
    "aircraftRegNo": "HL8041",
    "scheduleDatetime": "202603270420",
    "estimatedDatetime": "202603270356"
  }
}
```

## 11. callsign 정규화 전략

OpenSky에서 ADS-B callsign이 `KAL006`처럼 들어온다면, 저장 시점에 공항공사 편명을 미리 변환해서 저장하면 매칭이 쉬워짐.

예:
- `KE006` → `KAL006`
- `7C2104` → `JJA2104`
- `OZ741` → `AAR741`

권장:
- 원본 편명은 그대로 보존
- 별도로 `matchCallsign` 또는 callsign key를 생성해서 저장

## 12. 항공사 코드 변환표 필요

권장 예시:

```js
const iataToIcao = {
  KE: "KAL",
  OZ: "AAR",
  7C: "JJA",
  LJ: "JNA",
  TW: "TWB",
  BX: "ABL"
};
```

## 13. 인천공항공사 API 호출 관련 메모

### 하루치 조회 시 주의
인천 API는 기본적으로 조회일 기준 -3일 ~ +6일 범위를 포함할 수 있어서,
반드시 날짜/시간 파라미터를 넣어서 하루치로 좁혀야 함.

예:
- `searchDate=20260327`
- `searchFrom=0000`
- `searchTo=2400`

실제 하루치 조회 시 출발/도착 각각 약 1000건 정도 나올 수 있음.

중요:
- 이것은 항공기 수가 아니라 운항편 수
- 같은 항공기가 도착 1건 + 출발 1건이면 2건으로 잡힘

## 14. 페이지네이션

인천 API는:
- `pageNo`
- `numOfRows`
- `totalCount`

를 제공함.

즉 백엔드에서는:
1. 1페이지 호출
2. `totalCount` 확인
3. 총 페이지 수 계산
4. 모든 페이지 순회
5. 전체 목록 캐시

## 15. 실제 구현 권장 구조

### 백엔드
1. OpenSky 수집
2. 인국공 API 수집
3. 한국공 API 1 수집
4. 한국공 API 2 수집
5. 각 API 응답 가공
6. 편명/callsign 기준 매칭용 lookup 생성
7. 최종 표시 객체 생성
8. 프론트로 전달

### 프론트
표시용 객체만 받아서 그림:
- 위치
- 방향
- 출발공항
- 도착공항
- 기종
- 아이콘 크기

## 16. 최종 설계 방향

현재 계획:
- 한국공 API 2개
- 인국공 API 1개
- OpenSky

를 이용해서 통합 매칭

목표:
- 항적에 출발공항 / 도착공항 표시
- 기종에 따라 항공기 아이콘 크기 차등 표시

추천:
- 실제 매칭은 백엔드에서 수행
- 프론트는 시각화 전용
- 공항공사 응답은 JSON으로 저장 + 메모리 캐시로 사용

## 17. 현재 상태 정리

### 인천공항공사
- 실제 응답 확인 완료
- 데이터 사용 가능성 높음

### 한국공항공사
- 포털상 서비스 존재
- 하지만 실제 호출 시 `NO OPENAPI SERVICE ERROR` 발생
- 문서와 실제 서비스 상태가 다를 수 있음
- 나중에 재검증 필요

## 18. 결론

현재 대화 기준으로 가장 적절한 방향은 다음과 같음:

1. 공항공사 데이터를 가공한 JSON/lookup 데이터를 백엔드에 저장
2. OpenSky 실시간 항적이 들어올 때마다 callsign 기준으로 lookup
3. 매칭 성공 시 출도착공항 + 기종을 붙여서 프론트로 전달
4. 프론트는 기종별 아이콘 크기를 다르게 하여 시각화
5. 인천은 인국공 API 중심으로 우선 구현
6. 한국공 API는 나중에 실제 동작 여부 재확인 후 확대 적용

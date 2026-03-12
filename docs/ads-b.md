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
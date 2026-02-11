# 낙뢰 데이터 설계문서

## 1. 개요

### 1.1 목적
공항 기준 낙뢰 데이터를 수집해 거리 구간(8/16/32km)으로 분류하고, 대시보드 지도/알림(T-08)에서 사용한다.

### 1.2 실제 구현 기준 파일
- `backend/src/processors/lightning-processor.js`
- `backend/src/parsers/lightning-parser.js`
- `frontend/src/components/LightningMap.jsx`
- `frontend/server.js` (`/api/lightning`, `mergeTst1`)

---

## 2. API 수집

### 2.1 엔드포인트
- `config.api.lightning_url`
- 기본값: `https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php`

### 2.2 요청 파라미터
`lightning-processor.js`의 `buildLightningUrl()` 기준:

| 파라미터 | 값 |
|---|---|
| `tm` | 현재 시각 KST (`YYYYMMDDHHmm`) |
| `itv` | `config.lightning.itv_minutes` (기본 3) |
| `lon` | 공항 경도 |
| `lat` | 공항 위도 |
| `range` | `config.lightning.range_km` (기본 32) |
| `gc` | `"T"` |
| `authKey` | `config.api.auth_key` |

### 2.3 폴링 주기
- `config.schedule.lightning_interval = "*/3 * * * *"`
- 공항별 개별 호출(백엔드 수집 대상 공항 목록 기준)

---

## 3. 파싱 및 거리 분류

### 3.1 입력 유효성
`lightning-parser.js`:
- 응답에 `#START7777`와 `#7777END` 마커가 둘 다 없으면 에러
- 마커는 있으나 데이터 라인이 없으면 정상 0건 처리

### 3.2 라인 파싱
공백 분리 후 다음 필드 해석:
- `TM`, `LON`, `LAT`, `ST`, `T`, `HT`

유효성:
- `TM`은 14자리 (`YYYYMMDDHHmmss`)
- `LON/LAT/ST` 숫자
- `T`는 `G` 또는 `C`

### 3.3 시간 변환
- `time`: UTC ISO (`kstToUtcIso`)
- `time_kst`: KST ISO (`kstToKstIso`)

### 3.4 거리/구간 분류
`haversineKm()`으로 공항 ARP 기준 거리 계산 후:
- `<= alert(8km)` => `zone: "alert"`
- `<= danger(16km)` => `zone: "danger"`
- `<= caution(32km)` => `zone: "caution"`
- 그 외 `outside`는 결과에서 제외

출력 strike 필드 예:
- `time`, `time_kst`, `lon`, `lat`
- `intensity`, `intensity_abs`, `polarity`
- `type`, `type_name`, `height`
- `distance_km`, `zone`

정렬:
- `time` 내림차순(최신 우선)

---

## 4. 저장 구조

### 4.1 결과 envelope
`lightning-processor.js`:

```json
{
  "type": "lightning",
  "fetched_at": "...",
  "query": {
    "tm": "YYYYMMDDHHmm",
    "itv_minutes": 3,
    "range_km": 32
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

### 4.2 저장 방식
- `store.save("lightning", result)` 사용
- 파일:
  - `backend/data/lightning/latest.json`
  - `backend/data/lightning/LIGHTNING_YYYYMMDDTHHMMSSmmmZ.json`

---

## 5. 실패 처리

### 5.1 공항별 실패
API/파싱 실패 시:
- `failedAirports`에 기록
- 이전 데이터가 있으면 해당 공항 payload를 복구하고 `_stale: true` 추가
- 이전 데이터가 없으면 빈 payload 생성

### 5.2 결과 반환
processor는 다음 요약을 반환:
- `saved`
- `filePath`
- `airports` (공항 수)
- `totalStrikes`
- `failedAirports`

---

## 6. 프론트 표출

### 6.1 데이터 사용
`LightningMap.jsx`:
- `lightningData.airports[selectedAirport]` 사용
- 시간 필터 버튼: `10m`, `30m`, `1h`, `2h`

### 6.2 지도 렌더링
- 중심: 공항 ARP
- 반경 링: `8km`, `16km`, `32km`
- strike 마커: `+` 모양
- 좌표 변환: ARP 기준 위경도 차이를 km로 환산 후 canvas 좌표로 매핑

### 6.3 마커 색상 규칙(경과 시간)
- `<5m` 빨강
- `<10m` 주황
- `<15m` 노랑
- `<20m` 연두
- `<30m` 초록
- `<60m` 파랑
- 그 외 회색

---

## 7. 알림 연동 (T-08)

### 7.1 트리거
`frontend/src/utils/alerts/alert-triggers.js`의 `lightning_detected`:
- 카테고리: `lightning`
- 기본 params (`shared/alert-defaults.js`):
  - `min_count: 1`
  - `types: ["G", "C"]`
  - `zones: ["alert", "danger", "caution"]`

### 7.2 발동 조건
1. 현재 strike 중 params 조건 통과 건 필터
2. 이전 데이터 대비 신규 strike만 추출
3. 신규 건 수가 `min_count` 이상이면 발동

### 7.3 severity 결정
- 신규 `alert` zone 포함: `critical`
- 아니고 `danger` 포함: `warning`
- 그 외: `info`

---

## 8. TST1 오버레이

### 8.1 서버 병합
`frontend/server.js`:
- `/api/lightning` 응답 생성 시 `mergeTst1(payload, "lightning")` 호출
- `backend/data/TST1/lightning.json`이 있으면 `airports.TST1`로 병합

### 8.2 허용 포맷
- 단일 공항 payload 자체
- 또는 envelope 형태 `{ airports: { TST1: ... } }`

---

## 9. 검증 체크리스트

| # | 테스트 케이스 | 기대 결과 |
|---|---|---|
| 1 | 정상 응답 마커 존재 | 파싱 성공 |
| 2 | 마커 누락 | 파서 에러 처리 |
| 3 | 거리 분류 | 8/16/32km 구간 정확 |
| 4 | 공항별 실패 | 이전값 복구 또는 빈 payload |
| 5 | 저장 변경 없음 | 타임스탬프 파일 미생성 |
| 6 | 지도 시간 필터 | 선택 구간만 표시 |
| 7 | T-08 신규 strike | 알림 발동 |
| 8 | TST1 파일 존재 | `/api/lightning`에 `airports.TST1` 병합 |


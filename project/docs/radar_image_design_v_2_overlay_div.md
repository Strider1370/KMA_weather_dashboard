# 레이더 이미지 수집 및 표출 설계문서 (DIV 오버레이)

## 1. 개요

### 1.1 목적
기상청 레이더 합성 강수 PNG를 주기적으로 수집해 최근 프레임을 보관하고, 프론트에서 애니메이션 재생 + 공항 위치 마커 오버레이를 제공한다.

### 1.2 실제 구현 기준 파일
- `backend/src/processors/radar-processor.js`
- `frontend/server.cjs` (`/api/radar`, `/data/*`)
- `frontend/src/components/RadarPanel.jsx`

---

## 2. 수집 API

### 2.1 엔드포인트
- `config.api.radar_url`
- 기본값: `https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php`

### 2.2 요청 파라미터
`radar-processor.js::buildRadarUrl(tm)` 기준:

| 파라미터 | 값 |
|---|---|
| `tm` | KST 기준 `YYYYMMDDHHmm` |
| `data` | `"img"` |
| `cmp` | `config.radar.cmp` (기본 `"cmb"`) |
| `authKey` | `config.api.auth_key` |

인증키 규칙:
- `API_AUTH_KEY` 단일 사용

---

## 3. 스케줄 및 후보 시각

### 3.1 폴링 주기
- `config.schedule.radar_interval = "*/5 * * * *"`

### 3.2 후보 tm 계산
`getCandidateTms(delayMinutes = config.radar.delay_minutes)`:
1. 현재 UTC를 KST로 변환
2. `delay_minutes`(기본 10)만큼 뒤로 이동
3. 5분 단위 내림
4. 최신부터 3개 후보 생성 (0/5/10분 추가 과거)

예: `["202602111430", "202602111425", "202602111420"]`

---

## 4. 네트워크/유효성

### 4.1 timeout
`fetchWithTimeout()`:
- `AbortController` 사용
- 기본 timeout: `config.radar.timeout_ms` (기본 15000ms)

### 4.2 PNG 검증
`isValidPng(buffer)`:
- 최소 길이 > 1000
- PNG 시그니처(89 50 4E 47) 확인

### 4.3 응답 필터
`fetchRadarImage(tm)`:
- HTTP OK 아니면 실패
- `content-type`에 `image`/`zip`/`octet-stream` 중 하나 포함 필요
- 검증 통과 PNG만 반환

---

## 5. 저장 및 메타데이터

### 5.1 저장 경로
`backend/data/radar/`:
- `RDR_YYYYMMDDHHmm.png`
- `latest.json`

### 5.2 latest.json 구조
`updateLatestJson()` 생성:

```json
{
  "type": "RADAR",
  "updated_at": "2026-02-11T10:30:00.000Z",
  "image_count": 36,
  "interval_minutes": 5,
  "images": [
    {
      "tm": "202602111420",
      "tm_utc": "2026-02-11T05:20:00.000Z",
      "filename": "RDR_202602111420.png",
      "path": "/data/radar/RDR_202602111420.png"
    }
  ]
}
```

### 5.3 순환 정책
`cleanupOldImages()`:
- `RDR_*.png`만 대상으로 정렬
- `config.radar.max_images`(기본 36) 초과분 삭제

---

## 6. 수집 프로세스

`radar-processor.js::process()`:
1. 인증키 검사 (`auth_key` 없으면 에러)
2. `ensureRadarDir()`
3. `backfillIfEmpty()`:
   - 레이더 폴더가 비어 있으면 최대 `max_images` 범위로 과거 프레임 채움
4. `downloadLatestAvailable()`:
   - 후보 tm 3개를 순차 시도
   - 이미 파일이 있으면 `exists`
   - 최초 성공 1개 저장 후 종료
5. `cleanupOldImages()`
6. `updateLatestJson()`
7. 요약 반환:
   - `saved`, `imageCount`, `latestTm`, `downloaded`, `backfilled`

---

## 7. 서버 API 노출

`frontend/server.cjs`:
- `GET /api/radar`:
  - `backend/data/radar/latest.json` 반환
  - 없으면 빈 payload 반환:
    - `type: "RADAR"`, `image_count: 0`, `images: []`
- `GET /data/radar/*.png`:
  - `/data/*` 정적 파일 경로로 직접 서빙

---

## 8. 프론트 표출

### 8.1 컴포넌트
`frontend/src/components/RadarPanel.jsx`

### 8.2 동작
- 입력: `radarData.images`
- 프레임 전환 주기: `500ms`
- 이미지 없으면 `"Radar data unavailable."`
- 현재 프레임 정보 표시:
  - `Frame {index}/{count} ({tm})`

### 8.3 공항 마커 (DIV 오버레이)
- 기준 캔버스: `646x631`
- `AIRPORT_PIXELS` 고정표에서 ICAO별 픽셀 좌표 사용
- CSS 퍼센트로 환산해 `airport-marker` 절대배치
- 마커 문자열: `+`

---

## 9. 설정 포인트

`backend/src/config.js`:
- `radar.cmp` (기본 `cmb`)
- `radar.delay_minutes` (기본 10)
- `radar.max_images` (기본 36)
- `radar.interval_minutes` (기본 5, latest 메타용)
- `radar.timeout_ms` (기본 15000)
- `schedule.radar_interval` (`*/5 * * * *`)

---

## 10. 검증 체크리스트

| # | 테스트 케이스 | 기대 결과 |
|---|---|---|
| 1 | 인증키 없음 | processor 에러 반환 |
| 2 | 후보 1순위 실패/2순위 성공 | 2순위 이미지 저장 |
| 3 | 기존 파일 존재 후보 | 다운로드 스킵(`exists`) |
| 4 | PNG 유효성 실패 | 저장 안 함 |
| 5 | 최초 기동 폴더 비어 있음 | backfill 수행 |
| 6 | 36장 초과 | 오래된 파일부터 삭제 |
| 7 | `/api/radar` latest 없음 | 빈 payload 반환 |
| 8 | 프론트 프레임 애니메이션 | 500ms 간격 순환 |
| 9 | 공항 선택 변경 | 오버레이 마커 위치 변경 |

# 작업 요약 (2026-02-09)

## 1) 문서 준수 재정비
- `project/docs` 내 5개 문서(METAR/TAF/Warning/Scheduler_Cache/Visualization) 기준으로 파서/저장/표출 로직을 재검토함.
- TAF, METAR, 경보 파서를 문서 스키마와 규칙에 맞춰 보강함.

## 2) 핵심 수정 사항
- `backend/src/parsers/parse-utils.js`
  - 바람 단위 정규화(`KT`) 강화
  - 경보 시각 파싱(`YYYYMMDDHHmm -> ISO`) 추가
  - `DDhh` 파싱 보강(1~4자리 패딩)
  - METAR 온도 표출 포맷 토큰(`M05` 등) 추가
  - Weather icon key 해석 및 대표 아이콘 선택 로직 추가
  - Wind barb 계산 로직 추가
- `backend/src/parsers/metar-parser.js`
  - CAVOK/NSC 처리 정리
  - presentWeather nilReason 처리
  - wind shear 파싱
  - display 필드(바람/시정/운량/온도/QNH/아이콘) 정비
- `backend/src/parsers/taf-parser.js`
  - 변경군(BECMG/TEMPO/PROB*) 매핑/병합 재구성
  - `wx_touched`, `clouds_touched` 기반 partial merge 적용
  - NSW 후처리(BR 자동 부여 규칙) 적용
  - 유효기간 시간축(1시간 간격) 전개
  - TAF header 온도(TX/TN) 파싱 보강
- `backend/src/parsers/warning-parser.js`
  - `wrngType` 매핑 강화(`0`/`00` wind shear 대응)
  - 시간 필드 ISO 변환
  - 공항별 경보 시간 오름차순 정렬
  - `total_count`를 실제 파싱 건수로 집계
- `backend/src/store.js`
  - 파일 프리픽스 문서 규칙 적용(`METAR_`, `TAF_`, `WARNINGS_`)
  - canonical hash에서 메타 필드 제외 유지
  - 파일 회전 정렬을 파일명(타임스탬프) 기준으로 보강
- `backend/src/config.js`
  - API 기본 조회 행수 `numOfRows`를 `500`으로 상향(경보 누락 감소)

## 3) 프론트 간이 대시보드
- `frontend/index.html`, `frontend/styles.css`, `frontend/app.js`, `frontend/server.js`
- 로컬 주소: `http://localhost:5173`
- 공항 선택, METAR 요약, 경보 목록, TAF 전체 타임라인 표시
- 경보 타입 unknown 이슈는 매핑 보강으로 해소

## 4) 검증 결과
- 실행: `npm --prefix project test`
- 파서 로드/실행 정상
- RKSI 최신 TAF 샘플 기준 주요 시점 검증
  - 06Z: `17008KT CAVOK`
  - 02Z(next day): `6000 -RASN FEW010 BKN020 OVC060`
  - 07Z(next day): `20006KT 4000=` 전환 반영
- TX/TN 파싱 검증
  - `TX04/1006Z`, `TN01/0919Z` 정상 반영

## 5) 현재 참고 사항
- KMA API는 간헐적으로 `APPLICATION_ERROR`/인증 응답 이슈가 발생할 수 있음.
- 이 경우 캐시 복구(`_stale`) 경로로 데이터 공백을 완화하도록 구현되어 있음.

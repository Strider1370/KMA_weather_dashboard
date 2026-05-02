# Security Hardening Plan (Public Dashboard)

## Goal

- 공개 대시보드 특성(누구나 조회 가능)은 유지한다.
- 악의적/비정상 트래픽으로 인한 과도한 요청과 서비스 품질 저하를 최소화한다.
- 운영 복잡도를 과도하게 늘리지 않는 선에서 단계적으로 보안을 강화한다.

## Scope

- 대상 서비스: `server.js` 기반 API + 정적 데이터 제공 (`/api/*`, `/data/*`)
- 배포 환경: GCP VM + Nginx reverse proxy
- 비대상: 사용자 계정 기반 로그인 시스템(JWT/세션) 도입

## Current State (Confirmed)

### Applied / Good

- Nginx가 `80` 포트에서 서비스하고 `localhost:5173`으로 프록시 중.
- Node 서버가 `127.0.0.1:5173`에만 바인딩되어 외부 `:5173` 직통 접근이 차단됨.
- `/api/snapshot-meta` 해시 응답 정상 (`metar/taf/warning/lightning` hash + `echo.tm`).

### Remaining Risks

1. 인증/인가 없음
   - `/api/*`는 현재 누구나 조회 가능.
   - 공개 데이터 서비스 특성상 허용 가능한 설계일 수 있으나, 남용 방어는 별도 필요.

2. CORS 전체 허용
   - `Access-Control-Allow-Origin: *`로 브라우저 기반 타 사이트 호출 허용 상태.
   - 인증 대체 수단은 아님.

3. HTTP only (TLS 미적용)
   - 도메인/인증서 미적용 상태에서는 트래픽 보호 한계 존재.

4. 단일/완화된 rate limit 정책
   - 엔드포인트별 특성(가벼운/무거운 API) 구분이 부족하면 남용 대응이 약해질 수 있음.

5. 자동 차단/관측 체계 미흡 가능성
   - 비정상 IP 패턴을 자동 식별/차단하는 운영 룰(Cloud Armor/fail2ban)이 없으면 대응이 수동화됨.

## Threat Model (This Project)

- 목표 공격: 데이터 탈취보다는 과도한 API 호출로 트래픽/리소스 압박.
- 주요 벡터:
  - 봇의 반복 GET 호출
  - 특정 엔드포인트 집중 호출
  - 다수 IP 분산 호출(단순 per-IP 제한 우회)

## Hardening Strategy (Priority)

### P0 (Already done)

- Node 포트 외부 노출 차단 (`127.0.0.1:5173` 바인딩).
- 외부 진입을 Nginx(80/443)로 단일화.

### P1 (Recommended next)

1. Nginx rate limit 세분화
   - `/api/snapshot-meta`: 완화된 제한(폴링 친화)
   - `/api/metar|taf|warning|lightning`: 더 엄격한 제한
   - 초과 시 `429` 명확히 반환

2. 임시 ban 정책
   - 짧은 시간 내 과다 429/IP 패턴을 10~30분 차단
   - 구현 옵션: fail2ban 또는 Cloud Armor rate-based rule

3. 관측/알람
   - 지표: IP별 QPS, endpoint별 요청량, 429 비율
   - 임계치 초과 시 알람 및 룰 강화 절차 운영

### P2 (When domain is ready)

1. HTTPS(TLS) 적용
   - 80 -> 443 리다이렉트
   - HSTS 적용

2. CORS 화이트리스트 전환
   - `*` 제거, 실제 서비스 도메인만 허용

## Why no mandatory login/auth now?

- 서비스 목표가 "공개 조회"이므로 인증은 필수 요건이 아님.
- 현재 문제는 기밀성보다 남용 트래픽 억제이므로, 우선순위는 다음이 더 높음:
  - 네트워크 경로 통제
  - rate limit
  - 자동 ban
  - 관측/알람

## Operational Checklist

- [x] `:5173` 외부 차단 확인
- [x] Nginx 경유 접근만 허용 확인
- [x] snapshot-meta 정상 해시 응답 확인
- [ ] endpoint별 rate limit 정책 적용
- [ ] 임시 ban 자동화 적용
- [ ] 429/트래픽 모니터링 대시보드 구성
- [ ] (도메인 확보 후) HTTPS + CORS 화이트리스트 적용

## Validation Commands

```bash
# 1) Listen 상태 확인
sudo ss -lntp | grep -E ':80|:443|:5173'

# 2) 공개 경로 정상 확인
curl -s http://<PUBLIC_IP>/api/snapshot-meta

# 3) Node 직통 차단 확인
curl -s --max-time 3 http://<PUBLIC_IP>:5173/api/snapshot-meta || echo "blocked (expected)"
```

## Decision Log

- 공개 대시보드 정책 유지(인증 강제 도입 보류).
- 보안 목표를 "무단 조회 차단"이 아닌 "남용 트래픽 억제"로 정의.
- 이에 따라 네트워크/레이트리밋/자동차단 중심으로 단계적 하드닝 수행.

# Documentation Index

Status: Current documentation entry point as of 2026-05-02.

이 디렉터리는 KMA weather dashboard의 현재 설계, 운영, 수집기, 프론트엔드 동작 문서를 관리합니다. 과거 설계문서와 정리 작업 기록은 `archive/` 아래에 보관합니다.

이 사이트는 항공기상 관제/운항 지원을 위해 공항별 현재 관측, 예보, 공항경보, 공역 예보, 강수에코, 위성/안개, 낙뢰, 항공기 항적을 한 화면에서 확인하게 해주는 대시보드입니다. 문서는 크게 “화면에서 보이는 기능”, “백엔드가 데이터를 만드는 방식”, “파서와 판정 로직”, “운영 방법”으로 나뉩니다.

다른 프로젝트에 같은 기능을 구현하려면 먼저 이 README로 문서 위치를 잡고, 기능별 current 문서를 읽은 뒤, 필요한 경우 `archive/`의 과거 설계문서를 참고하세요. current 문서와 archive 문서가 충돌하면 항상 current 문서와 실제 코드를 우선합니다.

## 먼저 읽을 문서

1. [`../README.md`](../README.md): 현재 프로젝트의 사용자-facing 개요와 실행 방법.
2. [`../AGENTS.md`](../AGENTS.md): 에이전트 작업 규칙과 최신 운영 메모.
3. [`architecture.md`](architecture.md): 서버/API/스케줄러/데이터 저장 흐름.
4. [`backend-collectors.md`](backend-collectors.md): 백엔드 수집기와 산출물.
5. [`frontend-dashboard.md`](frontend-dashboard.md), [`map-overlays.md`](map-overlays.md): 화면과 지도 동작.

## 정리 후 목표 구조

아래 문서들은 현재 정리 작업의 주요 산출물입니다. 기존 설계문서와 충돌하면 이 표의 current-state 문서를 우선합니다.

| Target document | Role | Main source / archived docs |
|---|---|---|
| [`architecture.md`](architecture.md) | 서버/API/스케줄러/데이터 저장 흐름 | `archive/superseded/Scheduler_Cache_Design.md`, `archive/superseded/snapshot-meta-polling-plan.md`, `archive/superseded/rate-limit-and-radar-loop-notes.md` |
| [`backend-collectors.md`](backend-collectors.md) | KMA/OpenSky 수집기, 파서, 저장 파일 | `archive/superseded/ground-forecast-design.md`, `archive/superseded/Lightning_Data_Design.md`, `archive/superseded/satellite_overlay_design.md`, radar docs, `archive/research/ads-b.md` |
| [`frontend-dashboard.md`](frontend-dashboard.md) | `/ops`, `/ground`, `/test`, 모바일, 다크모드, TAF/METAR UI | `archive/superseded/Visualization.md`, `archive/superseded/mobile-ops-layout-plan.md`, `archive/superseded/darkmode.md`, `archive/superseded/Airport_Weather_Forecast_View.md` |
| [`map-overlays.md`](map-overlays.md) | 레이더, 위성, 낙뢰, ADS-B, SIGWX_LOW, SIGMET/AIRMET 지도 표시 | `archive/superseded/map.md`, radar docs, `archive/superseded/Lightning_Data_Design.md`, `archive/superseded/satellite_overlay_design.md`, `archive/superseded/SIGWX_LOW_Design.md`, `archive/superseded/SIGMET_AIRMET_Design.md`, `archive/research/ads-b.md` |
| [`weather-overlay-data-implementation.md`](weather-overlay-data-implementation.md) | 레이더/위성/낙뢰/ADS-B 데이터 파이프라인 재구현 설계 | radar/satellite/lightning/ADS-B processors and parsers |
| [`advisory-overlays-implementation.md`](advisory-overlays-implementation.md) | SIGMET/AIRMET/SIGWX_LOW 파싱, lifecycle, 그룹핑, 필터 재구현 설계 | advisory and SIGWX parser/helper source files |
| [`weather-parsing.md`](weather-parsing.md) | 파서 전체 구조와 공통 규칙 요약 | parser source files, detailed specs below |
| [`metar-parsing.md`](metar-parsing.md) | METAR/SPECI IWXXM 파싱 재구현 설계 | `backend/src/parsers/metar-parser.js`, `parse-utils.js`, `archive/appendix/METAR_Parsing_Algorithm.md` |
| [`taf-hourly-resolution.md`](taf-hourly-resolution.md) | TAF changeForecast 시간별 분해 재구현 설계 | `backend/src/parsers/taf-parser.js`, `parse-utils.js`, `archive/appendix/TAF_Hourly_Resolution_Algorithm.md` |
| [`warning-parsing.md`](warning-parsing.md) | 공항경보 XML 파싱 재구현 설계 | `backend/src/parsers/warning-parser.js`, `shared/warning-types`, `archive/appendix/Warning_Parsing_Algorithm.md` |
| [`alerts-and-settings.md`](alerts-and-settings.md) | 알림, 필터, MINIMA, Traffic 설정 | `archive/superseded/Alert_System_Design.md`, `archive/superseded/Advisory_Filter_Design.md`, current `README.md`/`AGENTS.md` notes |
| [`operations.md`](operations.md) | 배포, 보안, 트러블슈팅, 운영 제약 | `archive/superseded/security-hardening-plan.md`, current `README.md` deployment notes |
| `archive/` | 현재 동작이 아닌 과거 계획/상세 설계 보관 | stale or superseded design notes |

## 현재 코드 기준 빠른 사실

- 앱 서버는 `server.js`이고 `/`는 `/ops`로 redirect합니다.
- SPA entry는 `/ops`, `/ground`, `/test`입니다.
- 주요 JSON API는 `/api/metar`, `/api/taf`, `/api/warning`, `/api/sigmet`, `/api/airmet`, `/api/sigwx-low`, `/api/sigwx-low-history`, `/api/sigwx-low-fronts`, `/api/sigwx-low-clouds`, `/api/amos`, `/api/lightning`, `/api/adsb`, `/api/ground-forecast`, `/api/ground-overview`, `/api/environment`, `/api/airports`, `/api/warning-types`, `/api/alert-defaults`, `/api/snapshot-meta`입니다.
- 생성/저장 데이터는 기본적으로 `backend/data/` 아래에 있고 `/data/*`로 정적 제공됩니다.
- 스케줄러는 `backend/src/index.js`에서 `runWithLock(type, job)`으로 중복 실행을 막습니다.
- 스케줄 값은 `backend/src/config.js`의 `schedule` 객체가 기준입니다.
- 프론트엔드 라우트 모드는 `frontend/src/App.jsx`와 `frontend/src/utils/route-mode.js`가 기준입니다.
- 모바일 `/ops` 전용 레이아웃은 `MOBILE_OPS_BREAKPOINT = 768` 기준으로 활성화됩니다.
- 지도 오버레이의 현재 구현 기준 파일은 `frontend/src/components/InteractiveMap.jsx`입니다.
- METAR/TAF/WARNING은 재구현용 상세 설계를 각각 `metar-parsing.md`, `taf-hourly-resolution.md`, `warning-parsing.md`에 둡니다.

## 재구현용 로직 문서

다른 프로젝트에 기능을 옮길 때는 아래 문서를 우선 사용합니다.

- 파서 로직: [`metar-parsing.md`](metar-parsing.md), [`taf-hourly-resolution.md`](taf-hourly-resolution.md), [`warning-parsing.md`](warning-parsing.md), [`weather-parsing.md`](weather-parsing.md)
- 수집/저장/스케줄: [`backend-collectors.md`](backend-collectors.md), [`architecture.md`](architecture.md)
- 지도 오버레이와 타임라인: [`map-overlays.md`](map-overlays.md)
- 레이더/위성/낙뢰/ADS-B 데이터 생성: [`weather-overlay-data-implementation.md`](weather-overlay-data-implementation.md)
- SIGMET/AIRMET/SIGWX_LOW 오버레이 로직: [`advisory-overlays-implementation.md`](advisory-overlays-implementation.md)
- 알림/설정/필터 판정: [`alerts-and-settings.md`](alerts-and-settings.md)
- 라우트와 화면 구성: [`frontend-dashboard.md`](frontend-dashboard.md)

## 정리 원칙

- 현재 코드와 `README.md`/`AGENTS.md`가 기존 설계문서보다 우선입니다.
- 과거 설계문서를 현재 동작처럼 남기지 않습니다.
- 삭제는 신중하게 하고, 첫 패스에서는 `docs/archive/` 보관을 우선합니다.
- 문서를 이동하거나 이름을 바꾸면 저장소 전체에서 이전 파일명 참조를 검색해 링크를 갱신합니다.
- PowerShell에서 한국어 문서를 읽을 때는 UTF-8 명시 읽기를 사용합니다.

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -Raw -Encoding UTF8 "docs/README.md"
```

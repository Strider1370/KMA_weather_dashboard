import { formatUtc } from "../utils/helpers";

const TYPE_LABELS = {
  metar: "METAR",
  taf: "TAF",
  warning: "WARNING",
  lightning: "LIGHTNING",
  radar: "RADAR"
};

const TYPES_WITH_AIRPORTS = ["metar", "taf", "lightning"];

function pct(success, total) {
  if (!total) return "—";
  return (success / total * 100).toFixed(1) + "%";
}

function ageMinutes(isoTime) {
  if (!isoTime) return null;
  return Math.floor((Date.now() - new Date(isoTime).getTime()) / 60000);
}

function durationLabel(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  const sec = Math.round((new Date(endIso) - new Date(startIso)) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function ageLabel(ageMin) {
  if (ageMin === null) return "—";
  if (ageMin < 60) return `${ageMin}분 전`;
  return `${Math.floor(ageMin / 60)}h${ageMin % 60}m 전`;
}

// RKSI observes every 30 min; all others observe every hour.
function getExpectedMetarTime(icao, now) {
  const windowMin = (icao === "RKSI" && now.getUTCMinutes() >= 30) ? 30 : 0;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), windowMin));
}

function isMetarStale(icao, obsTimeStr, now) {
  if (!obsTimeStr) return true;
  return new Date(obsTimeStr) < getExpectedMetarTime(icao, now);
}

export default function StatsPanel({ stats, metar, tz = "UTC" }) {
  if (!stats || !stats.types) return null;

  // 에러 유형별 합산 (전 타입)
  const allErrorCounts = {};
  for (const entry of Object.values(stats.types)) {
    for (const [msg, cnt] of Object.entries(entry.error_counts || {})) {
      allErrorCounts[msg] = (allErrorCounts[msg] || 0) + cnt;
    }
  }
  const sortedErrors = Object.entries(allErrorCounts).sort((a, b) => b[1] - a[1]);

  // 공항별 실패 합산 (metar/taf/lightning)
  const airportTotals = {};
  for (const type of TYPES_WITH_AIRPORTS) {
    const failures = stats.types[type]?.airport_failures || {};
    for (const [icao, cnt] of Object.entries(failures)) {
      if (!airportTotals[icao]) airportTotals[icao] = { metar: 0, taf: 0, lightning: 0, total: 0 };
      airportTotals[icao][type] += cnt;
      airportTotals[icao].total += cnt;
    }
  }
  const sortedAirports = Object.entries(airportTotals).sort((a, b) => b[1].total - a[1].total);

  // 공항별 주요 에러 (metar/taf/lightning 합산 후 최다 에러)
  function getDominantError(icao) {
    const combined = {};
    for (const type of TYPES_WITH_AIRPORTS) {
      const errs = stats.types[type]?.airport_error_counts?.[icao] || {};
      for (const [msg, cnt] of Object.entries(errs)) {
        combined[msg] = (combined[msg] || 0) + cnt;
      }
    }
    const sorted = Object.entries(combined).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  const allRecentRuns = stats.recent_runs || [];
  const recentMetarTaf = allRecentRuns.filter(r => r.type === "metar" || r.type === "taf").slice(0, 20);
  const recentOther = allRecentRuns.filter(r => r.type === "warning" || r.type === "lightning" || r.type === "radar").slice(0, 20);

  return (
    <section className="panel stats-panel">
      <h3>API Collection Statistics
        {stats.since && (
          <span className="stats-since"> since {formatUtc(stats.since, tz)}</span>
        )}
      </h3>

      {/* 표 1: 타입별 수집 통계 */}
      <h4 className="stats-subtitle">Collection Summary</h4>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Total</th>
              <th>Success</th>
              <th>Failure</th>
              <th>Rate</th>
              <th>Last Run</th>
              <th>Last Error</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.types).map(([type, entry]) => (
              <tr key={type} className={entry.failure > 0 ? "stats-row-warn" : ""}>
                <td className="stats-type">{TYPE_LABELS[type] || type}</td>
                <td>{entry.total_runs}</td>
                <td className="stats-success">{entry.success}</td>
                <td className={entry.failure > 0 ? "stats-failure" : ""}>{entry.failure}</td>
                <td>{pct(entry.success, entry.total_runs)}</td>
                <td className="stats-time">{formatUtc(entry.last_run, tz)}</td>
                <td className="stats-error-cell">{entry.last_error || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 표 2: 에러 유형별 집계 */}
      {sortedErrors.length > 0 && (
        <>
          <h4 className="stats-subtitle">Error Breakdown <span className="stats-hint">(all types combined — KMA server fault evidence)</span></h4>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Error Message</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {sortedErrors.map(([msg, cnt]) => (
                  <tr key={msg}>
                    <td className="stats-error-cell">{msg}</td>
                    <td className="stats-failure">{cnt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 표 3: 공항별 실패 횟수 및 실패율 */}
      {sortedAirports.length > 0 && (
        <>
          <h4 className="stats-subtitle">Airport API Failures</h4>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Airport</th>
                  <th>METAR (fails/runs)</th>
                  <th>Rate</th>
                  <th>TAF (fails/runs)</th>
                  <th>Rate</th>
                  <th>Lightning (fails/runs)</th>
                  <th>Rate</th>
                  <th>주요 에러</th>
                </tr>
              </thead>
              <tbody>
                {sortedAirports.map(([icao, counts]) => {
                  const metarRuns = stats.types.metar?.total_runs || 0;
                  const tafRuns = stats.types.taf?.total_runs || 0;
                  const lightningRuns = stats.types.lightning?.total_runs || 0;
                  const dominantError = getDominantError(icao);
                  return (
                    <tr key={icao}>
                      <td className="stats-type">{icao}</td>
                      <td className={counts.metar ? "stats-failure" : ""}>{counts.metar ? `${counts.metar}/${metarRuns}` : "—"}</td>
                      <td className={counts.metar ? "stats-failure" : ""}>{counts.metar ? pct(counts.metar, metarRuns) : "—"}</td>
                      <td className={counts.taf ? "stats-failure" : ""}>{counts.taf ? `${counts.taf}/${tafRuns}` : "—"}</td>
                      <td className={counts.taf ? "stats-failure" : ""}>{counts.taf ? pct(counts.taf, tafRuns) : "—"}</td>
                      <td className={counts.lightning ? "stats-failure" : ""}>{counts.lightning ? `${counts.lightning}/${lightningRuns}` : "—"}</td>
                      <td className={counts.lightning ? "stats-failure" : ""}>{counts.lightning ? pct(counts.lightning, lightningRuns) : "—"}</td>
                      <td className="stats-error-cell">{dominantError || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 표 4: METAR 데이터 정시성 */}
      {metar?.airports && Object.keys(metar.airports).length > 0 && (() => {
        const metarStats = stats?.types?.metar;
        const metarRetry = stats?.retry_state?.metar || null;
        const now = new Date();
        return (
          <>
            <h4 className="stats-subtitle">METAR Data Freshness <span className="stats-hint">(정시 관측 윈도우 기준 — RKSI: 매 30분 / 기타: 매 시간, SPECI 제외)</span></h4>
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Airport</th>
                    <th>Report Type</th>
                    <th>관측 시각</th>
                    <th>경과</th>
                    <th>현재 상태</th>
                    <th>정상 수신</th>
                    <th>미확보</th>
                    <th>정시율</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metar.airports)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([icao, data]) => {
                      const reportType = data?.header?.report_type || "—";
                      const obsTime = data?.header?.observation_time || null;
                      const ageMin = ageMinutes(obsTime);
                      const isSpeci = reportType === "SPECI";
                      const stale = !isSpeci && isMetarStale(icao, obsTime, now);
                      const isRetrying = stale && metarRetry?.stale_icaos?.includes(icao);
                      const ontime = metarStats?.airport_ontime?.[icao] || 0;
                      const lateCount = metarStats?.airport_late?.[icao] || 0;
                      const totalChecked = ontime + lateCount;

                      let statusCell;
                      if (isSpeci) {
                        statusCell = "—";
                      } else if (isRetrying) {
                        statusCell = `⏳ 재시도 중 (${metarRetry.attempt}/${metarRetry.max_retries})`;
                      } else if (stale) {
                        statusCell = "❌ 미확보";
                      } else {
                        statusCell = "✅ 정상";
                      }

                      return (
                        <tr key={icao} className={stale && !isRetrying ? "stats-row-warn" : isRetrying ? "stats-row-retry" : ""}>
                          <td className="stats-type">{icao}</td>
                          <td className={isSpeci ? "stats-warn-text" : ""}>{reportType}</td>
                          <td className="stats-time">{formatUtc(obsTime, tz)}</td>
                          <td className={stale ? "stats-failure" : "stats-success"}>{ageLabel(ageMin)}</td>
                          <td className={isRetrying ? "stats-retry-text" : stale ? "stats-failure" : ""}>{statusCell}</td>
                          <td className="stats-success">{totalChecked ? ontime : "—"}</td>
                          <td className={lateCount ? "stats-failure" : ""}>{totalChecked ? lateCount : "—"}</td>
                          <td className={lateCount > ontime ? "stats-failure" : totalChecked ? "stats-success" : ""}>{totalChecked ? pct(ontime, totalChecked) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {/* 표 5a: METAR / TAF 최근 수집 이력 */}
      {recentMetarTaf.length > 0 && (
        <>
          <h4 className="stats-subtitle">Recent Runs — METAR / TAF <span className="stats-hint">(latest 20)</span></h4>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>시작</th>
                  <th>소요</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th>Error</th>
                  <th>Failed Airports</th>
                </tr>
              </thead>
              <tbody>
                {recentMetarTaf.map((run, i) => (
                  <tr key={i} className={run.success ? "" : "stats-row-warn"}>
                    <td className="stats-time">{formatUtc(run.start_time || run.time, tz)}</td>
                    <td className="stats-time">{durationLabel(run.start_time, run.time)}</td>
                    <td className="stats-type">{TYPE_LABELS[run.type] || run.type}</td>
                    <td>{run.success ? "✅" : "❌"}</td>
                    <td className="stats-error-cell">{run.error || "—"}</td>
                    <td>{run.failed_airports?.length > 0 ? run.failed_airports.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 표 5b: WARNING / LIGHTNING / RADAR 최근 수집 이력 */}
      {recentOther.length > 0 && (
        <>
          <h4 className="stats-subtitle">Recent Runs — WARNING / LIGHTNING / RADAR <span className="stats-hint">(latest 20)</span></h4>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>시작</th>
                  <th>소요</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th>Error</th>
                  <th>Failed Airports</th>
                </tr>
              </thead>
              <tbody>
                {recentOther.map((run, i) => (
                  <tr key={i} className={run.success ? "" : "stats-row-warn"}>
                    <td className="stats-time">{formatUtc(run.start_time || run.time, tz)}</td>
                    <td className="stats-time">{durationLabel(run.start_time, run.time)}</td>
                    <td className="stats-type">{TYPE_LABELS[run.type] || run.type}</td>
                    <td>{run.success ? "✅" : "❌"}</td>
                    <td className="stats-error-cell">{run.error || "—"}</td>
                    <td>{run.failed_airports?.length > 0 ? run.failed_airports.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {recentMetarTaf.length === 0 && recentOther.length === 0 && (
        <p className="stats-empty">No collection runs recorded yet.</p>
      )}
    </section>
  );
}

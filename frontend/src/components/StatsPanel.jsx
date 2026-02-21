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

export default function StatsPanel({ stats, tz = "UTC" }) {
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

  const recentRuns = (stats.recent_runs || []).slice(0, 20);

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

      {/* 표 3: 공항별 부분 실패 */}
      {sortedAirports.length > 0 && (
        <>
          <h4 className="stats-subtitle">Airport Partial Failures <span className="stats-hint">(within successful runs)</span></h4>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Airport</th>
                  <th>METAR</th>
                  <th>TAF</th>
                  <th>Lightning</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedAirports.map(([icao, counts]) => (
                  <tr key={icao}>
                    <td className="stats-type">{icao}</td>
                    <td>{counts.metar || 0}</td>
                    <td>{counts.taf || 0}</td>
                    <td>{counts.lightning || 0}</td>
                    <td className="stats-failure">{counts.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 표 4: 최근 수집 이력 */}
      {recentRuns.length > 0 && (
        <>
          <h4 className="stats-subtitle">Recent Collection Runs <span className="stats-hint">(latest 20)</span></h4>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th>Error</th>
                  <th>Failed Airports</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run, i) => (
                  <tr key={i} className={run.success ? "" : "stats-row-warn"}>
                    <td className="stats-time">{formatUtc(run.time, tz)}</td>
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

      {recentRuns.length === 0 && (
        <p className="stats-empty">No collection runs recorded yet.</p>
      )}
    </section>
  );
}

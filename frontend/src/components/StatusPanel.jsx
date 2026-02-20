import { formatUtc } from "../utils/helpers";

function StatusItem({ label, status, tz = "UTC" }) {
  if (!status || !status.exists) {
    return (
      <div className="status-item">
        <span className="status-label">{label}</span>
        <span className="status-value">Not collected yet</span>
        <span className="status-sub">0 files cached</span>
      </div>
    );
  }

  return (
    <div className="status-item">
      <span className="status-label">{label}</span>
      <span className="status-value">{status.last_updated ? formatUtc(status.last_updated, tz) : "Unknown"}</span>
      <span className="status-sub">{status.file_count} file{status.file_count !== 1 ? "s" : ""} cached</span>
    </div>
  );
}

export default function StatusPanel({ status, tz = "UTC" }) {
  if (!status) return null;

  return (
    <section className="panel">
      <h3>Data Collection Status</h3>
      <div className="status-grid">
        <StatusItem label="METAR" status={status.metar} tz={tz} />
        <StatusItem label="TAF" status={status.taf} tz={tz} />
        <StatusItem label="WARNING" status={status.warning} tz={tz} />
      </div>
      <p className="status-note">
        <strong>Schedule:</strong> METAR every 10 min &bull; TAF every 30 min &bull; WARNING every 5 min
      </p>
    </section>
  );
}

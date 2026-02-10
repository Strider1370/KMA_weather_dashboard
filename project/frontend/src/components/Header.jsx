import { formatUtc } from "../utils/helpers";

export default function Header({ lastUpdated, onSettingsClick }) {
  return (
    <header className="hero">
      <p className="eyebrow">Operational Snapshot</p>
      <h1>KMA Aviation Weather Dashboard</h1>
      <p className="sub">
        {lastUpdated ? `Last Updated: ${formatUtc(lastUpdated)}` : "Loading latest backend data..."}
      </p>
      {onSettingsClick && (
        <button
          className="alert-settings-btn"
          onClick={onSettingsClick}
          title="알림 설정"
          aria-label="알림 설정"
        >
          &#9881;
        </button>
      )}
    </header>
  );
}

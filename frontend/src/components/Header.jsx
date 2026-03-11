import { formatUtc } from "../utils/helpers";

export default function Header({
  lastUpdated,
  onSettingsClick,
  airports = [],
  selectedAirport,
  onAirportChange,
  tz = "UTC"
}) {
  return (
    <header className="hero">
      <p className="eyebrow">Operational Snapshot</p>
      <div className="hero-top">
        <h1 className="dashboard-title">KMA Aviation Weather Dashboard</h1>
        <div className="hero-actions">
          {airports.length > 0 && onAirportChange && (
            <div className="header-controls">
              <select
                id="airport-select"
                value={selectedAirport || ""}
                onChange={(e) => onAirportChange(e.target.value)}
                aria-label="Airport"
              >
                {airports.map((icao) => (
                  <option key={icao} value={icao}>{icao}</option>
                ))}
              </select>
            </div>
          )}
          {onSettingsClick && (
            <button
              className="alert-settings-btn"
              onClick={onSettingsClick}
              title="Alert settings"
              aria-label="Alert settings"
            >
              &#9881;
            </button>
          )}
        </div>
      </div>
      <p className="sub">
        {lastUpdated ? `Last Updated: ${formatUtc(lastUpdated, tz)}` : "Loading latest backend data..."}
      </p>
    </header>
  );
}

import { formatUtc } from "../utils/helpers";

export default function Header({
  lastUpdated,
  onSettingsClick,
  detailsOpen,
  onToggleDetails,
  airports = [],
  selectedAirport,
  onAirportChange,
  onRefresh
}) {
  return (
    <header className="hero">
      <p className="eyebrow">Operational Snapshot</p>
      <div className="hero-top">
        <h1 className="dashboard-title">
          KMA Aviation Weather Dashboard
          {onToggleDetails && (
            <button
              type="button"
              className="dashboard-toggle-btn"
              onClick={onToggleDetails}
              aria-label={detailsOpen ? "Hide dashboard details" : "Show dashboard details"}
              title={detailsOpen ? "Hide dashboard details" : "Show dashboard details"}
            >
              {detailsOpen ? "v" : ">"}
            </button>
          )}
        </h1>
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
              <button
                type="button"
                className="refresh-icon-btn"
                onClick={onRefresh}
                title="Refresh data"
                aria-label="Refresh data"
              >
                ↻
              </button>
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
        {lastUpdated ? `Last Updated: ${formatUtc(lastUpdated)}` : "Loading latest backend data..."}
      </p>
    </header>
  );
}

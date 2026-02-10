export default function Controls({ airports, selectedAirport, onAirportChange, onRefresh }) {
  return (
    <section className="panel controls">
      <label htmlFor="airport-select">Airport</label>
      <select
        id="airport-select"
        value={selectedAirport || ""}
        onChange={(e) => onAirportChange(e.target.value)}
      >
        {airports.map((icao) => (
          <option key={icao} value={icao}>{icao}</option>
        ))}
      </select>
      <button type="button" onClick={onRefresh}>Refresh</button>
    </section>
  );
}

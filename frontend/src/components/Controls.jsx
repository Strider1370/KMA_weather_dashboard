export default function Controls({ airports, selectedAirport, onAirportChange }) {
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
    </section>
  );
}

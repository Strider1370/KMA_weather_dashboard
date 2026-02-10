import { formatUtc } from "../utils/helpers";

export default function Header({ lastUpdated }) {
  return (
    <header className="hero">
      <p className="eyebrow">Operational Snapshot</p>
      <h1>KMA Aviation Weather Dashboard</h1>
      <p className="sub">
        {lastUpdated ? `Last Updated: ${formatUtc(lastUpdated)}` : "Loading latest backend data..."}
      </p>
    </header>
  );
}

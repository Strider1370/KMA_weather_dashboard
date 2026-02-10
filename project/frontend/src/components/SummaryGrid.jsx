import { safe } from "../utils/helpers";

export default function SummaryGrid({ metar, taf, warning, lightning }) {
  const metarCount = Object.keys(metar?.airports || {}).length;
  const tafCount = Object.keys(taf?.airports || {}).length;
  const warningCount = Object.keys(warning?.airports || {}).length;
  const warningTotal = safe(warning?.total_count, 0);
  const lightningTotal = Object.values(lightning?.airports || {}).reduce((sum, airport) => {
    return sum + (airport?.summary?.total_count || airport?.strikes?.length || 0);
  }, 0);

  return (
    <section className="summary-grid">
      <article className="tile">
        <h2>METAR Airports</h2>
        <p className="metric">{metarCount}</p>
      </article>
      <article className="tile">
        <h2>TAF Airports</h2>
        <p className="metric">{tafCount}</p>
      </article>
      <article className="tile">
        <h2>Warning Airports</h2>
        <p className="metric">{warningCount}</p>
      </article>
      <article className="tile">
        <h2>Total Warnings</h2>
        <p className="metric">{warningTotal}</p>
      </article>
      <article className="tile">
        <h2>Total Lightning</h2>
        <p className="metric">{lightningTotal}</p>
      </article>
    </section>
  );
}

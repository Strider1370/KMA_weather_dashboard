import { safe, formatUtc, getSeverityLevel } from "../utils/helpers";

export default function TafTimeline({ tafData, icao }) {
  const target = tafData?.airports?.[icao];
  const timeline = target?.timeline || [];

  return (
    <section className="panel">
      <h3>TAF Timeline (full)</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Wind</th>
              <th>Visibility</th>
              <th>Weather</th>
              <th>Clouds</th>
            </tr>
          </thead>
          <tbody>
            {timeline.length === 0 ? (
              <tr>
                <td colSpan="5">No TAF timeline data for selected airport.</td>
              </tr>
            ) : (
              timeline.map((slot, i) => {
                const level = getSeverityLevel({
                  visibility: slot.visibility?.value,
                  wind: slot.wind?.speed,
                  gust: slot.wind?.gust,
                });
                return (
                  <tr key={i} className={`row-${level}`}>
                    <td>{formatUtc(slot.time)}</td>
                    <td>{safe(slot.display?.wind)}</td>
                    <td>{safe(slot.display?.visibility)}</td>
                    <td>{safe(slot.display?.weather)}</td>
                    <td>{safe(slot.display?.clouds)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

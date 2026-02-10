import { safe, getSeverityLevel, severityLabel } from "../utils/helpers";

export default function MetarCard({ metarData, icao }) {
  const target = metarData?.airports?.[icao];

  if (!target) {
    return (
      <article className="panel">
        <h3>Current METAR</h3>
        <pre className="mono">No METAR data for selected airport.</pre>
      </article>
    );
  }

  const wind = target.observation?.wind?.speed;
  const gust = target.observation?.wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const level = getSeverityLevel({ visibility, wind, gust });

  const lines = [
    `Status: ${severityLabel(level)}`,
    `Wind: ${safe(target.observation?.display?.wind)}`,
    `Visibility: ${safe(target.observation?.display?.visibility)}`,
    `Weather: ${safe(target.observation?.display?.weather)}`,
    `Clouds: ${safe(target.observation?.display?.clouds)}`,
    `Temp: ${safe(target.observation?.display?.temperature)}`,
    `QNH: ${safe(target.observation?.display?.qnh)}`,
  ];

  return (
    <article className="panel">
      <h3>Current METAR</h3>
      <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
    </article>
  );
}

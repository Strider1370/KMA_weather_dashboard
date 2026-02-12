import { safe, formatUtc, getSeverityLevel } from "../utils/helpers";

export default function MetarCard({ metarData, icao }) {
  const target = metarData?.airports?.[icao];

  if (!target) {
    return (
      <article className="panel">
        <h3>METAR/SPECI</h3>
        <pre className="mono">No METAR data for selected airport.</pre>
      </article>
    );
  }

  const wind = target.observation?.wind?.speed;
  const gust = target.observation?.wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const level = getSeverityLevel({ visibility, wind, gust });

  const lines = [
    `Report Type: ${safe(target.header?.report_type || metarData?.type || "METAR")}`,
    `Issue Time: ${safe(formatUtc(target.header?.issue_time || target.header?.observation_time))}`,
    `Wind: ${safe(target.observation?.display?.wind)}`,
    `Visibility: ${safe(target.observation?.display?.visibility)}`,
    `Weather: ${safe(target.observation?.display?.weather)}`,
    `Clouds: ${safe(target.observation?.display?.clouds)}`,
    `Temp: ${safe(target.observation?.display?.temperature)}`,
    `QNH: ${safe(target.observation?.display?.qnh)}`,
  ];

  return (
    <article className="panel">
      <h3>METAR/SPECI</h3>
      <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
    </article>
  );
}



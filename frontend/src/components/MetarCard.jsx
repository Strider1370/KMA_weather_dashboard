import { safe, formatUtc, getSeverityLevel, computeFeelsLikeC, computeRelativeHumidity } from "../utils/helpers";
import WeatherIcon from "./WeatherIcon";
import { resolveIconKey, resolveWindBarb, convertWeatherToKorean } from "../utils/visual-mapper";

export default function MetarCard({ metarData, icao, version = "v2", onVersionToggle, tz = "UTC" }) {
  const target = metarData?.airports?.[icao];

  if (!target) {
    return (
      <div className="metric-cards-empty">
        <p>No METAR data for selected airport.</p>
      </div>
    );
  }

  const windSpeed = target.observation?.wind?.speed;
  const windGust = target.observation?.wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const issueTime = target.header?.issue_time || target.header?.observation_time;
  const obsTime = target.header?.observation_time || issueTime;
  const rain1h = target.observation?.rainfall_1h || null;
  const rainText = (rain1h?.mm == null || rain1h.mm <= 0) ? "— mm" : `${rain1h.mm.toFixed(1)} mm`;
  const feelsLike = computeFeelsLikeC({
    tempC: target.observation?.temperature?.air,
    dewpointC: target.observation?.temperature?.dewpoint,
    windKt: target.observation?.wind?.speed,
    observedAt: obsTime,
  });
  const feelsLikeText = feelsLike.value == null ? "—" : `${feelsLike.value.toFixed(1)}°C`;

  const tempC = target.observation?.temperature?.air;
  const dewpointC = target.observation?.temperature?.dewpoint;
  const rh = computeRelativeHumidity(tempC, dewpointC);
  const tempDisplay = Number.isFinite(tempC) ? `${tempC.toFixed(1)}°C` : "—";
  const rhDisplay = Number.isFinite(rh) ? `${Math.round(rh)}%` : "—";

  const visibilityRaw = target.observation?.display?.visibility;
  const visibilityText = (visibilityRaw == null || visibilityRaw === "//" || visibilityRaw === "-")
    ? "—"
    : visibilityRaw;

  // Ceiling: lowest BKN/OVC base
  const clouds = target.observation?.clouds || [];
  const ceilingCloud = clouds
    .filter(c => c.amount === "BKN" || c.amount === "OVC")
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0];
  const ceilingText = ceilingCloud?.base != null
    ? `${ceilingCloud.base}ft`
    : "NSC";

  // v1 text mode (kept as dead code path)
  if (version === "v1") {
    const level = getSeverityLevel({ visibility, wind: windSpeed, gust: windGust });
    const rainHourText = /^\d{12}$/.test(rain1h?.target_hour_kst || "")
      ? `${rain1h.target_hour_kst.slice(8, 10)}:00 KST`
      : "-";
    const lines = [
      `Report Type: ${safe(target.header?.report_type || metarData?.type || "METAR")}`,
      `Issue Time: ${safe(formatUtc(issueTime, tz))}`,
      `Wind: ${safe(target.observation?.display?.wind)}`,
      `Visibility: ${visibilityText}`,
      `Weather: ${safe(target.observation?.display?.weather)}`,
      `Clouds: ${safe(target.observation?.display?.clouds)}`,
      `Temp: ${safe(target.observation?.display?.temperature)}`,
      `Relative Humidity: ${rhDisplay}`,
      `Rainfall(1h @ ${rainHourText}): ${rainText}`,
      `Feels Like: ${feelsLikeText}`,
      `QNH: ${safe(target.observation?.display?.qnh)}`,
    ];
    return (
      <article className="panel metar-panel-v1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>METAR/SPECI</h3>
        </div>
        <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
      </article>
    );
  }

  // New layout: primary + secondary metric cards
  const iconKey = resolveIconKey(target.observation, issueTime);
  const barb = resolveWindBarb(target.observation?.wind);
  const weatherKorean = convertWeatherToKorean(target.observation?.display?.weather, target.observation?.cavok);

  const windDir = target.observation?.wind;
  const windDirText = windDir?.calm ? "CALM"
    : windDir?.variable ? "VRB"
    : (windDir?.direction != null ? `${windDir.direction}°` : "—");
  const windSpeedText = windDir?.calm ? "0" : (windSpeed != null ? String(windSpeed) : "—");

  return (
    <>
      {/* ③-1 주요 메트릭 (4열) */}
      <div className="metric-row metric-row-primary">
        {/* 현재 날씨 */}
        <div className="metric-card">
          <div className="metric-card-label">현재 날씨</div>
          <div className="metric-card-icon">
            <WeatherIcon iconKey={iconKey} />
          </div>
          <div className="metric-card-main-text">{weatherKorean}</div>
        </div>
        {/* 바람 */}
        <div className="metric-card">
          <div className="metric-card-label">바람</div>
          <div className="metric-card-wind-inline">
            <span
              className="metric-wind-arrow-inline"
              style={{ transform: `rotate(${barb.rotation + 180}deg)` }}
            >
              ↑
            </span>
            <span className="metric-wind-value">{windSpeedText}</span>
            <span className="metric-wind-unit">kt</span>
          </div>
        </div>
        {/* 시정 */}
        <div className="metric-card">
          <div className="metric-card-label">시정</div>
          <div className="metric-card-value-row">
            <span className="metric-card-value">{visibilityText}</span>
            <span className="metric-card-value-unit">m</span>
          </div>
        </div>
        {/* 운고 */}
        <div className="metric-card">
          <div className="metric-card-label">운고</div>
          <div className="metric-card-value">{ceilingText}</div>
        </div>
      </div>

      {/* ③-2 보조 메트릭 (4열) */}
      <div className="metric-row metric-row-secondary">
        <div className="metric-card-sm">
          <div className="metric-card-label">기온</div>
          <div className="metric-card-sm-value">{tempDisplay}</div>
        </div>
        <div className="metric-card-sm">
          <div className="metric-card-label">체감온도</div>
          <div className="metric-card-sm-value">{feelsLikeText}</div>
        </div>
        <div className="metric-card-sm">
          <div className="metric-card-label">상대습도</div>
          <div className="metric-card-sm-value">{rhDisplay}</div>
        </div>
        <div className="metric-card-sm">
          <div className="metric-card-label">강수량(1h)</div>
          <div className="metric-card-sm-value">{rainText}</div>
        </div>
      </div>
    </>
  );
}

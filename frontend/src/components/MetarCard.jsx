import { safe, formatUtc, getSeverityLevel, computeFeelsLikeC, computeRelativeHumidity } from "../utils/helpers";
import WeatherIcon, { WindBarb } from "./WeatherIcon";
import { resolveIconKey, resolveWindBarb, convertWeatherToKorean } from "../utils/visual-mapper";

export default function MetarCard({ metarData, icao, version = "v1", onVersionToggle, tz = "UTC" }) {
  const target = metarData?.airports?.[icao];

  if (!target) {
    return (
      <article className="panel">
        <h3>METAR/SPECI</h3>
        <pre className="mono">No METAR data for selected airport.</pre>
      </article>
    );
  }

  const windSpeed = target.observation?.wind?.speed;
  const windGust = target.observation?.wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const level = getSeverityLevel({ visibility, wind: windSpeed, gust: windGust });
  const issueTime = target.header?.issue_time || target.header?.observation_time;
  const obsTime = target.header?.observation_time || issueTime;
  const rain1h = target.observation?.rainfall_1h || null;
  const rainText = (rain1h?.mm == null || rain1h.mm <= 0) ? "-mm" : `${rain1h.mm.toFixed(1)} mm`;
  const rainHourText = /^\d{12}$/.test(rain1h?.target_hour_kst || "")
    ? `${rain1h.target_hour_kst.slice(8, 10)}:00 KST`
    : "-";
  const feelsLike = computeFeelsLikeC({
    tempC: target.observation?.temperature?.air,
    dewpointC: target.observation?.temperature?.dewpoint,
    windKt: target.observation?.wind?.speed,
    observedAt: obsTime,
  });
  const feelsLikeText = feelsLike.value == null ? "-" : `${feelsLike.value.toFixed(1)}°C`;
  const rh = computeRelativeHumidity(
    target.observation?.temperature?.air,
    target.observation?.temperature?.dewpoint
  );
  const rhText = Number.isFinite(rh) ? `${Math.round(rh)}%` : "-";
  const visibilityRaw = target.observation?.display?.visibility;
  const visibilityText = (visibilityRaw == null || visibilityRaw === "//" || visibilityRaw === "-")
    ? "-"
    : `${visibilityRaw} m`;

  if (version === "v2") {
    const iconKey = resolveIconKey(target.observation, issueTime);
    const barb = resolveWindBarb(target.observation?.wind);
    const weatherKorean = convertWeatherToKorean(target.observation?.display?.weather, target.observation?.cavok);
    
    const tempC = target.observation?.temperature?.air;
    const dewpointC = target.observation?.temperature?.dewpoint;
    const rh = computeRelativeHumidity(tempC, dewpointC);
    const tempDisplay = Number.isFinite(tempC) ? `${tempC.toFixed(1)}°C` : "-";
    const rhDisplay = Number.isFinite(rh) ? `${Math.round(rh)}%` : "-";

    return (
      <article className="metar-v2 panel">
        <div className="metar-v2-header">
          <div className="metar-v2-icao">{icao}</div>
          <div className="metar-v2-time">{formatUtc(issueTime, tz)} METAR</div>
        </div>

        <div className="metar-v2-main">
          <div className="metar-v2-icon-box">
            <WeatherIcon iconKey={iconKey} />
            <div className="metar-v2-phenomena">{weatherKorean}</div>
          </div>
          
          <div className="metar-v2-wind-side">
            <div className="wind-arrow-box-v2">
              <div 
                className="wind-arrow-v2" 
                style={{ transform: `rotate(${barb.rotation + 180}deg)` }}
              >
                ↑
              </div>
            </div>
            <div className="metar-v2-wind-value-v2">{windSpeed}kt</div>
          </div>
        </div>

        <div className="metar-v2-grid">
          <div className="metar-v2-item">
            <div className="metar-v2-label">기온</div>
            <div className="metar-v2-value">{tempDisplay}</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">상대습도</div>
            <div className="metar-v2-value">{rhDisplay}</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">강수량(1시간)</div>
            <div className="metar-v2-value">{rainText}</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">체감온도</div>
            <div className="metar-v2-value">{feelsLikeText}</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">시정</div>
            <div className="metar-v2-value">{visibilityText}</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">운고</div>
            <div className="metar-v2-value">{target.observation?.clouds?.[0]?.base || "-"}ft</div>
          </div>
        </div>
        
        <button 
          className="dashboard-toggle-btn" 
          onClick={() => onVersionToggle?.("v1")}
          style={{ marginTop: 'auto' }}
        >
          텍스트 모드 보기
        </button>
      </article>
    );
  }

  const lines = [
    `Report Type: ${safe(target.header?.report_type || metarData?.type || "METAR")}`,
    `Issue Time: ${safe(formatUtc(issueTime, tz))}`,
    `Wind: ${safe(target.observation?.display?.wind)}`,
    `Visibility: ${visibilityText}`,
    `Weather: ${safe(target.observation?.display?.weather)}`,
    `Clouds: ${safe(target.observation?.display?.clouds)}`,
    `Temp: ${safe(target.observation?.display?.temperature)}`,
    `Relative Humidity: ${rhText}`,
    `Rainfall(1h @ ${rainHourText}): ${rainText}`,
    `Feels Like: ${feelsLikeText}`,
    `QNH: ${safe(target.observation?.display?.qnh)}`,
  ];

  return (
    <article className="panel metar-panel-v1">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>METAR/SPECI</h3>
        <button className="dashboard-toggle-btn" onClick={() => onVersionToggle?.("v2")}>
          사이드바 모드
        </button>
      </div>
      <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
    </article>
  );
}

import {
  safe,
  formatUtc,
  getSeverityLevel,
  computeFeelsLikeC,
  computeRelativeHumidity,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  getFlightCategory,
} from "../utils/helpers";
import WeatherIcon from "./WeatherIcon";
import { resolveIconKey, resolveWindBarb, convertWeatherToKorean } from "../utils/visual-mapper";

function getWindDirectionLabel(wind) {
  if (!wind) return "-";
  if (wind.calm) return "CALM";
  if (wind.variable) return "VRB";
  if (!Number.isFinite(wind.direction)) return "-";
  return `${wind.direction}°`;
}

function pickRunwayDirection(runwayHdg, windDir) {
  if (!Number.isFinite(runwayHdg)) return null;
  if (!Number.isFinite(windDir)) return runwayHdg;
  const optionA = runwayHdg;
  const optionB = (runwayHdg + 180) % 360;
  const diffA = Math.abs(((windDir - optionA + 180 + 360) % 360) - 180);
  const diffB = Math.abs(((windDir - optionB + 180 + 360) % 360) - 180);
  return diffA <= diffB ? optionA : optionB;
}

function formatCrosswindText(wind, runwayHdg) {
  if (!wind || wind.calm) return "측풍 0kt";
  if (!Number.isFinite(wind.speed) || !Number.isFinite(wind.direction) || !Number.isFinite(runwayHdg)) {
    return "측풍 -";
  }
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  const crosswindComponent = wind.speed * Math.sin((relative * Math.PI) / 180);
  const side = crosswindComponent > 0 ? "R" : crosswindComponent < 0 ? "L" : "";
  const crosswind = Math.abs(crosswindComponent);
  return side ? `측풍 ${side} ${Math.round(crosswind)}kt` : `측풍 ${Math.round(crosswind)}kt`;
}

function formatCrosswindValue(wind, runwayHdg) {
  return formatCrosswindText(wind, runwayHdg).replace(/^측풍\s*/, "");
}

function getCrosswindArrow(wind, runwayHdg) {
  if (!wind || wind.calm) return "↑";
  if (!Number.isFinite(wind.speed) || !Number.isFinite(wind.direction) || !Number.isFinite(runwayHdg)) {
    return "↑";
  }
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  const crosswindComponent = wind.speed * Math.sin((relative * Math.PI) / 180);
  if (crosswindComponent > 0) return "←";
  if (crosswindComponent < 0) return "→";
  return "↑";
}

function formatVisibilityValue(value, rawText) {
  if (rawText && rawText !== "//" && rawText !== "-") {
    return /\d$/.test(rawText) ? `${rawText} m` : rawText;
  }
  if (Number.isFinite(value)) return `${value} m`;
  return "-";
}

function hasSpecialWeather(observation) {
  const raw = String(observation?.display?.weather || "").toUpperCase();
  return ["TS", "FG", "BR", "SN"].some((token) => raw.includes(token));
}

export default function MetarCard({
  metarData,
  icao,
  airportMeta = null,
  metarTime = "",
  version = "v2",
  onVersionToggle,
  tz = "UTC",
}) {
  const target = metarData?.airports?.[icao];

  if (!target) {
    return (
      <div className="metric-cards-empty">
        <p>No METAR data for selected airport.</p>
      </div>
    );
  }

  const wind = target.observation?.wind || null;
  const windSpeed = wind?.speed;
  const windGust = wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const issueTime = target.header?.issue_time || target.header?.observation_time;
  const obsTime = target.header?.observation_time || issueTime;
  const rain1h = target.observation?.rainfall_1h || null;
  const rainText = rain1h?.mm == null || rain1h.mm <= 0 ? null : `${rain1h.mm.toFixed(1)} mm/h`;
  const feelsLike = computeFeelsLikeC({
    tempC: target.observation?.temperature?.air,
    dewpointC: target.observation?.temperature?.dewpoint,
    windKt: windSpeed,
    observedAt: obsTime,
  });

  const tempC = target.observation?.temperature?.air;
  const dewpointC = target.observation?.temperature?.dewpoint;
  const rh = computeRelativeHumidity(tempC, dewpointC);
  const tempDisplay = Number.isFinite(tempC) ? `${tempC.toFixed(1)}°C` : "-";
  const feelsLikeText = feelsLike.value == null ? "체감 -" : `체감 ${feelsLike.value.toFixed(1)}°C`;
  const rhDisplay = Number.isFinite(rh) ? `${Math.round(rh)}%` : "-";

  const visibilityRaw = target.observation?.display?.visibility;
  const visibilityValue = formatVisibilityValue(visibility, visibilityRaw);

  const clouds = target.observation?.clouds || [];
  const ceilingCloud = clouds
    .filter((cloud) => cloud.amount === "BKN" || cloud.amount === "OVC")
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0];
  const ceilingFt = ceilingCloud?.base ?? null;
  const ceilingValue = Number.isFinite(ceilingFt) ? `${ceilingFt} ft` : "NSC";

  if (version === "v1") {
    const level = getSeverityLevel({ visibility, wind: windSpeed, gust: windGust });
    const rainHourText = /^\d{12}$/.test(rain1h?.target_hour_kst || "")
      ? `${rain1h.target_hour_kst.slice(8, 10)}:00 KST`
      : "-";
    const lines = [
      `Report Type: ${safe(target.header?.report_type || metarData?.type || "METAR")}`,
      `Issue Time: ${safe(formatUtc(issueTime, tz))}`,
      `Wind: ${safe(target.observation?.display?.wind)}`,
      `Visibility: ${visibilityValue}`,
      `Weather: ${safe(target.observation?.display?.weather)}`,
      `Clouds: ${safe(target.observation?.display?.clouds)}`,
      `Temp: ${safe(target.observation?.display?.temperature)}`,
      `Relative Humidity: ${rhDisplay}`,
      `Rainfall(1h @ ${rainHourText}): ${rainText || "-"}`,
      `Feels Like: ${feelsLike.value == null ? "-" : `${feelsLike.value.toFixed(1)}C`}`,
      `QNH: ${safe(target.observation?.display?.qnh)}`,
    ];
    return (
      <article className="panel metar-panel-v1">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h3 style={{ margin: 0 }}>METAR/SPECI</h3>
        </div>
        <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
      </article>
    );
  }

  const iconKey = resolveIconKey(target.observation, issueTime);
  const weatherKorean = convertWeatherToKorean(target.observation?.display?.weather, target.observation?.cavok);
  const windDirectionText = getWindDirectionLabel(wind);
  const windSpeedText = wind?.calm ? "0" : Number.isFinite(windSpeed) ? String(windSpeed) : "-";
  const windGustText = Number.isFinite(windGust) ? `Gust ${windGust}kt` : null;
  const crosswindValue = formatCrosswindValue(wind, airportMeta?.runway_hdg ?? null);
  const crosswindArrow = getCrosswindArrow(wind, airportMeta?.runway_hdg ?? null);
  const visibilityCategory = classifyVisibilityCategory(visibility);
  const ceilingCategory = classifyCeilingCategory(ceilingFt);
  const flightCategory = getFlightCategory(visibility, ceilingFt);
  const metarTimeText = metarTime.replace(/\s+METAR$/, "").trim();
  const specialWeather = hasSpecialWeather(target.observation);

  return (
    <section className="metar-panel">
      <div className="metar-panel-grid">
        <div className="metar-section">
          <div className="metar-section-head">
            <div className="metar-section-time">
              <span className="panel-kind-badge">METAR</span>
              <span>{metarTimeText}</span>
            </div>
          </div>
          <div className="metar-section-body metar-section-body--weather">
            <div className="metar-weather-grid">
              <article className={`metar-surface-card metar-surface-card--weather${specialWeather ? " metar-card--special-weather" : ""}`}>
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--weather-image">
                    <img src="/weather-title.png" alt="" aria-hidden="true" />
                  </div>
                  <div className="metar-side-text">현재 날씨</div>
                </div>
                <div className="metar-side-value">
                  <div className="metar-weather-inline-icon">
                    <WeatherIcon iconKey={iconKey} />
                  </div>
                  <div className="metar-weather-text">{weatherKorean}</div>
                  {rainText && <div className="metar-rain-text">{rainText}</div>}
                </div>
              </article>

              <article className="metar-surface-card metar-surface-card--wind">
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--wind">
                    <img src="/172922.png" alt="" aria-hidden="true" />
                  </div>
                  <div className="metar-side-text">바람</div>
                </div>
                <div className="metar-side-value">
                  <div className="metar-wind-row">
                    <span className="metar-wind-heading-inline">{windDirectionText}</span>
                    <span className="metar-wind-speed">{windSpeedText}</span>
                    <span className="metar-wind-unit">kt</span>
                  </div>
                  {windGustText && <div className="metar-wind-layer metar-wind-layer--gust">{windGustText}</div>}
                </div>
              </article>
            </div>

            <div className="metar-weather-grid metar-weather-grid--bottom">
              <article className="metar-surface-card metar-surface-card--compact">
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--metric">
                    <svg viewBox="0 0 24 24" role="presentation">
                      <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12 10v7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="metar-side-text">기온 /<br />상대습도</div>
                </div>
                <div className="metar-side-value">
                  <div className="metar-compact-value metar-compact-value--paired">{tempDisplay} / {rhDisplay}</div>
                  <div className="metar-compact-sub">{feelsLikeText}</div>
                </div>
              </article>

              <article className="metar-surface-card metar-surface-card--compact">
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--metric">
                    <span className="metar-crosswind-arrow" aria-hidden="true">{crosswindArrow}</span>
                  </div>
                  <div className="metar-side-text">측풍</div>
                </div>
                <div className="metar-side-value">
                  <div className="metar-compact-value">{crosswindValue}</div>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className="metar-section">
          <div className="metar-section-head">
            <div className="metar-section-label">현재비행조건</div>
          </div>
          <div className="metar-section-body metar-section-body--conditions">
            <div className="flight-condition-layout">
              <article className="flight-category-panel" style={{ backgroundColor: flightCategory.color }}>
                <div className="flight-category-panel-code">{flightCategory.category}</div>
                <div className="flight-category-panel-label">{flightCategory.labelKo}</div>
              </article>

              <div className="flight-condition-stack">
                <article
                  className="flight-condition-card"
                  style={{
                    backgroundColor: visibilityCategory.bg,
                    borderLeftColor: visibilityCategory.border,
                    borderTopColor: visibilityCategory.borderSoft,
                    borderRightColor: visibilityCategory.borderSoft,
                    borderBottomColor: visibilityCategory.borderSoft,
                  }}
                >
                  <div className="flight-condition-head">
                    <span className="flight-condition-label" style={{ color: visibilityCategory.color }}>시정</span>
                    <span
                      className="flight-condition-pill"
                      style={{ color: visibilityCategory.color, backgroundColor: "#ffffffaa" }}
                    >
                      {visibilityCategory.category}
                    </span>
                  </div>
                  <div className="flight-condition-value" style={{ color: visibilityCategory.valueColor }}>
                    {visibilityValue}
                  </div>
                </article>

                <article
                  className="flight-condition-card"
                  style={{
                    backgroundColor: ceilingCategory.bg,
                    borderLeftColor: ceilingCategory.border,
                    borderTopColor: ceilingCategory.borderSoft,
                    borderRightColor: ceilingCategory.borderSoft,
                    borderBottomColor: ceilingCategory.borderSoft,
                  }}
                >
                  <div className="flight-condition-head">
                    <span className="flight-condition-label" style={{ color: ceilingCategory.color }}>운고</span>
                    <span
                      className="flight-condition-pill"
                      style={{ color: ceilingCategory.color, backgroundColor: "#ffffffaa" }}
                    >
                      {ceilingCategory.category}
                    </span>
                  </div>
                  <div className="flight-condition-value" style={{ color: ceilingCategory.valueColor }}>
                    {ceilingValue}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

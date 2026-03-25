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
import { convertWeatherToKorean } from "../utils/visual-mapper";
import { resolveWeatherVisual } from "../utils/weather-visual-resolver";
import tempIcon from "../../../temp_icon.png";

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
  return side ? `측풍 ${side}/${Math.round(crosswind)}kt` : `측풍 ${Math.round(crosswind)}kt`;
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

function getWindDirectionRotation(wind) {
  if (!wind || wind.calm || !Number.isFinite(wind.direction)) {
    return 0;
  }
  const normalized = ((wind.direction % 360) + 360) % 360;
  return (normalized + 180) % 360;
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
  return ["TS", "FG", "SN"].some((token) => raw.includes(token));
}

function getMetarBadgeText(header, fallbackType) {
  const reportType = String(header?.report_type || fallbackType || "METAR").trim().toUpperCase();
  if (reportType === "SPECI") return "SPECI";
  return "METAR";
}

export default function MetarCard({
  metarData,
  amosData,
  icao,
  airportMeta = null,
  metarTime = "",
  version = "v2",
  onVersionToggle,
  tz = "UTC",
}) {
  const target = metarData?.airports?.[icao];
  const amosTarget = amosData?.airports?.[icao] || null;

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
  const dailyRain = amosTarget?.daily_rainfall || null;
  const rainText = dailyRain?.mm == null || dailyRain.mm <= 0 ? null : `일강수량 ${dailyRain.mm.toFixed(1)} mm`;
  const feelsLike = computeFeelsLikeC({
    tempC: target.observation?.temperature?.air,
    dewpointC: target.observation?.temperature?.dewpoint,
    windKt: windSpeed,
    observedAt: obsTime,
  });

  const tempC = target.observation?.temperature?.air;
  const dewpointC = target.observation?.temperature?.dewpoint;
  const rh = computeRelativeHumidity(tempC, dewpointC);
  const tempDisplay = Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : "-";
  const feelsLikeText = feelsLike.value == null ? null : `체감온도 ${feelsLike.value.toFixed(1)}°C`;
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
    const rainObservedText = /^\d{12}$/.test(dailyRain?.observed_tm_kst || "")
      ? `${dailyRain.observed_tm_kst.slice(8, 10)}:${dailyRain.observed_tm_kst.slice(10, 12)} KST`
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
      `Daily Rainfall(@ ${rainObservedText}): ${rainText || "-"}`,
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

  const weatherVisual = resolveWeatherVisual(target.observation, issueTime);
  const weatherKorean = convertWeatherToKorean(
    target.observation?.display?.weather,
    target.observation?.cavok,
    target.observation?.clouds || []
  );
  const windDirectionText = getWindDirectionLabel(wind);
  const windSpeedText = wind?.calm ? "0" : Number.isFinite(windSpeed) ? String(windSpeed) : "-";
  const windGustText = Number.isFinite(windGust) ? `Gust ${windGust}kt` : null;
  const windDirectionRotation = getWindDirectionRotation(wind);
  const crosswindValue = formatCrosswindValue(wind, airportMeta?.runway_hdg ?? null);
  const crosswindArrow = getCrosswindArrow(wind, airportMeta?.runway_hdg ?? null);
  const visibilityCategory = classifyVisibilityCategory(visibility);
  const ceilingCategory = classifyCeilingCategory(ceilingFt);
  const flightCategory = getFlightCategory(visibility, ceilingFt);
  const metarTimeText = metarTime.trim();
  const metarBadgeText = getMetarBadgeText(target.header, metarData?.type);
  const specialWeather = hasSpecialWeather(target.observation);

  return (
    <section className="metar-panel">
      <div className="metar-panel-grid">
        <div className="metar-section">
          <div className="metar-section-head">
            <div className="metar-section-time">
              <span className="panel-kind-badge">{metarBadgeText}</span>
              <span>{metarTimeText}</span>
            </div>
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

        <div className="metar-section">
          <div className="metar-section-head" />
          <div className="metar-section-body metar-section-body--weather">
            <div className="metar-weather-grid">
              <article className={`metar-surface-card metar-surface-card--weather${specialWeather ? " metar-card--special-weather" : ""}`}>
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--weather-image">
                    <img src="/weather-title.png" alt="" aria-hidden="true" />
                  </div>
                  <div className="metar-side-text">현재 날씨</div>
                </div>
                <div className="metar-side-value metar-side-value--anchored">
                  <div className="metar-side-anchor">
                    <div className="metar-side-main">
                      <div className="metar-weather-inline-icon">
                        <WeatherIcon visual={weatherVisual} />
                      </div>
                      <div className="metar-weather-text">{weatherKorean}</div>
                    </div>
                    <div className="metar-side-secondary">
                      {rainText ? <div className="metar-rain-text">{rainText}</div> : null}
                    </div>
                  </div>
                </div>
              </article>

              <article className="metar-surface-card metar-surface-card--wind">
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--wind">
                    <span
                      className="metar-direction-arrow"
                      aria-hidden="true"
                      style={{ transform: `rotate(${windDirectionRotation}deg)` }}
                    >
                      ↑
                    </span>
                  </div>
                  <div className="metar-side-text">바람</div>
                </div>
                <div className="metar-side-value metar-side-value--anchored">
                  <div className="metar-side-anchor">
                    <div className="metar-side-main">
                      <div className="metar-wind-row">
                        <span className="metar-wind-inline-text">{`${windDirectionText}/${windSpeedText}kt`}</span>
                      </div>
                    </div>
                    <div className="metar-side-secondary">
                      {windGustText ? <div className="metar-wind-layer metar-wind-layer--gust">{windGustText}</div> : null}
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div className="metar-weather-grid metar-weather-grid--bottom">
              <article className="metar-surface-card metar-surface-card--compact">
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--metric metar-side-icon--temp">
                    <img src={tempIcon} alt="" aria-hidden="true" />
                  </div>
                  <div className="metar-side-text">온도/습도</div>
                </div>
                <div className="metar-side-value metar-side-value--anchored">
                  <div className="metar-side-anchor">
                    <div className="metar-side-main">
                      <div className="metar-compact-value metar-compact-value--paired">{tempDisplay} / {rhDisplay}</div>
                    </div>
                    <div className="metar-side-secondary metar-side-secondary--compact">
                      {feelsLikeText ? <div className="metar-compact-sub">{feelsLikeText}</div> : null}
                    </div>
                  </div>
                </div>
              </article>

              <article className="metar-surface-card metar-surface-card--compact">
                <div className="metar-side-label">
                  <div className="metar-side-icon metar-side-icon--metric">
                    <span className="metar-direction-arrow" aria-hidden="true">{crosswindArrow}</span>
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
      </div>
    </section>
  );
}

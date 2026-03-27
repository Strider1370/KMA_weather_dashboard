import React from "react";
import {
  safe,
  formatUtc,
  getSeverityLevel,
  getDisplayDate,
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
} from "../utils/helpers";
import WeatherIcon from "./WeatherIcon";
import {
  groupElementsByValue,
  convertWeatherToKorean,
} from "../utils/visual-mapper";
import { resolveWeatherVisual } from "../utils/weather-visual-resolver";

const FC_COLORS = { VFR: "#15803d", MVFR: "#2563eb", IFR: "#f59e0b", LIFR: "#dc2626" };
const WEATHER_STYLE = { backgroundColor: "rgba(234, 179, 8, 0.10)", color: "#92400e" };
const WIND_STYLE = { backgroundColor: "var(--card-bg)", color: "var(--muted)" };
const TAF_SEGMENT_DENSITY = {
  SOLO: "solo",
  COMPACT: "compact",
  FULL: "full",
};
const TINT_STYLE = {
  VFR: { backgroundColor: "rgba(21, 128, 61, 0.08)", borderLeft: "3px solid #15803d", color: "#166534" },
  MVFR: { backgroundColor: "rgba(37, 99, 235, 0.08)", borderLeft: "3px solid #2563eb", color: "#1d4ed8" },
  IFR: { backgroundColor: "rgba(245, 158, 11, 0.08)", borderLeft: "3px solid #f59e0b", color: "#b45309" },
  LIFR: { backgroundColor: "rgba(220, 38, 38, 0.08)", borderLeft: "3px solid #dc2626", color: "#b91c1c" },
};

function getCeiling(slot) {
  return slot.clouds
    ?.filter((cloud) => cloud.amount === "BKN" || cloud.amount === "OVC")
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null;
}

function formatCeiling(base) {
  return base != null ? `${base}ft` : "NSC";
}

function formatVisibility(vis, displayValue) {
  if (Number.isFinite(vis)) {
    return `${vis}m`;
  }
  if (displayValue && displayValue !== "//" && displayValue !== "-") {
    const numeric = displayValue.replace(/\D/g, "");
    return numeric ? `${Number(numeric)}m` : displayValue;
  }
  return "-";
}

function formatVisibilityValue(vis, displayValue) {
  const meters = parseVisibilityMeters(vis, displayValue);
  if (!Number.isFinite(meters)) return "-";
  return `${meters}m`;
}

function parseVisibilityMeters(vis, displayValue) {
  if (Number.isFinite(vis)) return vis;
  if (displayValue && displayValue !== "//" && displayValue !== "-") {
    const numeric = Number(displayValue.replace(/\D/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }
  return null;
}

function formatCompactVisibility(vis, displayValue) {
  const meters = parseVisibilityMeters(vis, displayValue);
  // Compact cells stay readable by accepting the original display string when parsing fails.
  if (!Number.isFinite(meters)) return formatVisibility(vis, displayValue);
  return `${meters}m`;
}

function getSegmentDensity(hourCount) {
  if (hourCount <= 1) return TAF_SEGMENT_DENSITY.SOLO;
  if (hourCount === 2) return TAF_SEGMENT_DENSITY.COMPACT;
  return TAF_SEGMENT_DENSITY.FULL;
}

function getDensityContainerClass(density) {
  if (density === TAF_SEGMENT_DENSITY.SOLO) return " taf-new-seg--solo";
  if (density === TAF_SEGMENT_DENSITY.COMPACT) return " taf-new-seg--compact";
  return "";
}

function getBasicLabelClass(density) {
  if (density === TAF_SEGMENT_DENSITY.FULL) return "segment-label";
  return "segment-label taf-new-seg-small";
}

function shouldShowWeatherText(density) {
  return density !== TAF_SEGMENT_DENSITY.SOLO;
}

function shouldShowWindText(density) {
  return density !== TAF_SEGMENT_DENSITY.SOLO;
}

function getWeatherLabelClass(density) {
  if (density === TAF_SEGMENT_DENSITY.COMPACT) return "segment-label taf-new-seg-small";
  return "segment-label";
}

function getWindLabelClass(_density) {
  return "segment-label";
}

function getVisibilityText(vis, displayValue, density) {
  if (density === TAF_SEGMENT_DENSITY.FULL) return formatVisibilityValue(vis, displayValue);
  return formatCompactVisibility(vis, displayValue);
}

function getVisibilityLabelClass(density) {
  if (density === TAF_SEGMENT_DENSITY.SOLO) return "segment-label taf-new-seg-xsmall";
  if (density === TAF_SEGMENT_DENSITY.COMPACT) return "segment-label taf-new-seg-medium";
  return "segment-label";
}

function getVisibilitySegmentExtraClass(density) {
  return density === TAF_SEGMENT_DENSITY.SOLO ? " taf-new-seg--visibility-solo" : "";
}

function getSegmentClassName(baseClass, density, extraClasses = "") {
  return `taf-new-seg ${baseClass}${getDensityContainerClass(density)}${extraClasses}`;
}

function hasSpecialWeather(slot) {
  const raw = String(slot?.display?.weather || "").toUpperCase();
  return ["TS", "SN", "FG"].some((token) => raw.includes(token));
}

function getTafBadgeText(header) {
  const combined = `${header?.report_type || ""} ${header?.report_status || ""}`.toUpperCase();
  if (combined.includes("CORR") || /\bCOR\b/.test(combined)) return "TAF COR";
  if (combined.includes("AMEND") || /\bAMD\b/.test(combined)) return "TAF AMD";
  return "TAF";
}

function buildTafTableSegments(timeline, icao, minimaSettings) {
  const segments = [];

  for (const slot of timeline) {
    const ceiling = getCeiling(slot);
    const flightCategory = getFlightCategory(slot.visibility?.value ?? null, ceiling, icao, minimaSettings).category;
    const signature = JSON.stringify({
      flightCategory,
      wind: slot.display?.wind || "",
      visibility: slot.display?.visibility || "",
      weather: slot.display?.weather || "",
      clouds: slot.display?.clouds || "",
    });

    const previous = segments[segments.length - 1];
    if (previous && previous.signature === signature) {
      previous.end = slot.time;
      previous.hourCount += 1;
      continue;
    }

    segments.push({
      signature,
      start: slot.time,
      end: slot.time,
      hourCount: 1,
      slot,
    });
  }

  return segments;
}

function formatTafRange(start, end, tz) {
  const startDate = getDisplayDate(start, tz);
  const endDate = getDisplayDate(end, tz);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "-";
  }

  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  const startHour = String(startDate.getUTCHours()).padStart(2, "0");
  const rawExclusiveHour = endDate.getUTCHours() + 1;
  const isMidnight = rawExclusiveHour === 24;
  const endHourExclusive = isMidnight ? "24" : String(rawExclusiveHour).padStart(2, "0");
  const endDayLabel = endDay !== startDay ? ` ${endDay}일` : "";

  if (start === end) {
    return `${startDay}일 ${startHour}시`;
  }

  return `${startDay}일 ${startHour}시 ~${endDayLabel} ${endHourExclusive}시`;
}

export default function TafTimeline({ tafData, icao, minimaSettings = null, version = "v2", onVersionToggle, tz = "UTC" }) {
  const target = tafData?.airports?.[icao];
  const timeline = target?.timeline || [];
  const isTimelineView = version === "v2";
  const tableSegments = buildTafTableSegments(timeline, icao, minimaSettings);
  const lastEnd = target?.header?.valid_end;
  const tafTime = formatUtc(target?.header?.valid_start, tz);
  const tafTimeText = tafTime || "";
  const tafBadgeText = getTafBadgeText(target?.header);

  if (timeline.length === 0) {
    return (
      <section className="taf-panel-empty">
        <p>No TAF timeline data for selected airport.</p>
      </section>
    );
  }

  if (version === "v2") {
    const flightCatGroups = groupElementsByValue(timeline, (slot) => {
      const vis = slot.visibility?.value ?? null;
      const ceil = getCeiling(slot);
      return getFlightCategory(vis, ceil, icao, minimaSettings).category;
    });
    const weatherGroups = groupElementsByValue(timeline, (slot) => {
      const weatherVisual = resolveWeatherVisual(slot, slot.time);
      const weatherText = convertWeatherToKorean(slot.display?.weather, slot.cavok, slot.clouds || []);
      const baseIconId = String(weatherVisual?.iconId || "unknown")
        .replace(/-(day|night)$/, "");
      return `${baseIconId}|${weatherText}`;
    });
    const windGroups = groupElementsByValue(timeline, (slot) => {
      const wind = slot.wind;
      return `${wind?.direction ?? "VRB"}_${wind?.speed ?? 0}_${wind?.gust ?? 0}`;
    });
    const ceilingGroups = groupElementsByValue(timeline, (slot) => String(getCeiling(slot) ?? "null"));
    const visibilityGroups = groupElementsByValue(timeline, (slot) => String(slot.visibility?.value ?? "null"));

    return (
      <section className="taf-new-panel">
        <div className="taf-new-header">
          <span className="taf-new-validity">
            <span className="panel-kind-badge">{tafBadgeText}</span>
            <span>{tafTimeText}</span>
          </span>
          <div className="taf-view-toggle" role="tablist" aria-label="TAF view mode">
            <button
              type="button"
              className={`taf-view-toggle-btn${isTimelineView ? " active" : ""}`}
              onClick={() => onVersionToggle?.("v2")}
              aria-pressed={isTimelineView}
            >
              타임라인
            </button>
            <button
              type="button"
              className={`taf-view-toggle-btn${!isTimelineView ? " active" : ""}`}
              onClick={() => onVersionToggle?.("table")}
              aria-pressed={!isTimelineView}
            >
              테이블
            </button>
          </div>
        </div>
        <div className="taf-new-container">
          <div className="taf-new-row time-row">
            <div className="taf-new-label"></div>
            <div className="taf-new-scale" style={{ "--taf-hour-count": String(timeline.length) }}>
              {timeline.map((slot, i) => {
                const dateObj = getDisplayDate(slot.time, tz);
                const hour = dateObj.getUTCHours();
                const isFirst = i === 0;
                const isNewDay = hour === 0;
                if (hour % 3 === 0 || isFirst || isNewDay) {
                  return (
                    <div key={i} className="taf-scale-item" style={{ left: `${(i / timeline.length) * 100}%` }}>
                      {(isFirst || isNewDay) && <span className="taf-scale-date">{dateObj.getUTCDate()}일</span>}
                      <span className="taf-scale-hour">{hour}시</span>
                    </div>
                  );
                }
                return null;
              })}
              {lastEnd && (() => {
                const endDate = getDisplayDate(lastEnd, tz);
                return (
                  <div className="taf-scale-item taf-scale-end" style={{ left: "100%" }}>
                    <span className="taf-scale-hour">{endDate.getUTCHours()}시</span>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--flight">
            <div className="taf-new-label">비행조건</div>
            <div className="taf-new-timeline">
              {flightCatGroups.map((group, i) => {
                const category = group.value;
                const density = getSegmentDensity(group.hourCount);
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--flight", density)}
                    style={{
                      width: `${group.width}%`,
                      backgroundColor: FC_COLORS[category] || FC_COLORS.VFR,
                      color: "#fff",
                    }}
                    title={category}
                  >
                    <span className={getBasicLabelClass(density)}>{category}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--visibility">
            <div className="taf-new-label">날씨</div>
            <div className="taf-new-timeline">
              {weatherGroups.map((group, i) => (
                (() => {
                  const density = getSegmentDensity(group.hourCount);
                  const weatherVisual = resolveWeatherVisual(group.data, group.data.time);
                  const miniWeatherVisual = weatherVisual
                    ? { ...weatherVisual, intensityOverlay: null }
                    : weatherVisual;
                  const [, weatherLabel = group.value] = String(group.value).split("|");

                  return (
                    <div
                      key={i}
                      className={getSegmentClassName(
                        "taf-new-seg--weather",
                        density,
                        hasSpecialWeather(group.data) ? " taf-new-seg--special-weather" : ""
                      )}
                      style={{ width: `${group.width}%`, ...WEATHER_STYLE }}
                      title={weatherLabel}
                    >
                      <WeatherIcon visual={miniWeatherVisual} className="mini" />
                      {shouldShowWeatherText(density) && <span className={getWeatherLabelClass(density)}>{weatherLabel}</span>}
                    </div>
                  );
                })()
              ))}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--ceiling">
            <div className="taf-new-label">바람</div>
            <div className="taf-new-timeline">
              {windGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                const wind = group.data.wind;
                const windText = `${wind?.speed ?? 0}${wind?.gust ? `G${wind.gust}` : ""}kt`;
                const rotation = (wind?.direction || 0) + 180;
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--wind", density)}
                    style={{ width: `${group.width}%`, ...WIND_STYLE }}
                    title={`${wind?.direction ?? "VRB"}° ${windText}`}
                  >
                    <span className="wind-arrow-inline" style={{ transform: `rotate(${rotation}deg)` }}>↑</span>
                    {shouldShowWindText(density) && <span className={getWindLabelClass(density)}>{windText}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row">
            <div className="taf-new-label">시정</div>
            <div className="taf-new-timeline">
              {visibilityGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                const vis = group.data.visibility?.value ?? null;
                const style = TINT_STYLE[classifyVisibilityCategory(vis, icao, minimaSettings).category];
                const visibilityText = getVisibilityText(vis, group.data.display?.visibility, density);
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--tint", density, getVisibilitySegmentExtraClass(density))}
                    style={{ width: `${group.width}%`, ...style }}
                    title={visibilityText}
                  >
                    <span className={getVisibilityLabelClass(density)}>{visibilityText}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row">
            <div className="taf-new-label">운고</div>
            <div className="taf-new-timeline">
              {ceilingGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                const ceiling = getCeiling(group.data);
                const style = TINT_STYLE[classifyCeilingCategory(ceiling, icao, minimaSettings).category];
                const ceilingText = formatCeiling(ceiling);
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--tint", density)}
                    style={{ width: `${group.width}%`, ...style }}
                    title={ceilingText}
                  >
                    <span className={getBasicLabelClass(density)}>{ceilingText}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (version === "v3") {
    return (
      <section className="panel">
        <h3>공항예보 (TAF) 상세 그리드 - {icao}</h3>
        <div className="taf-v3-wrapper">
          <div className="taf-v3-labels">
            <div className="taf-v3-label">시간</div>
            <div className="taf-v3-label">날씨</div>
            <div className="taf-v3-label">바람</div>
            <div className="taf-v3-label">운고</div>
            <div className="taf-v3-label">시정</div>
          </div>
          <div className="taf-v3-grid">
            {timeline.map((slot, i) => {
              const weatherVisual = resolveWeatherVisual(slot, slot.time);
              const wind = slot.wind;
              const rotation = (wind?.direction || 0) + 180;
              const windText = `${wind?.speed}${wind?.gust ? `G${wind.gust}` : ""}kt`;
              return (
                <div key={i} className="taf-v3-card">
                  <div className="taf-v3-data-time">{getDisplayDate(slot.time, tz).getUTCHours()}시</div>
                  <div className="taf-v3-data-icon"><WeatherIcon visual={weatherVisual} /></div>
                  <div className="taf-v3-data-wind">
                    <span className="wind-arrow-inline" style={{ transform: `rotate(${rotation}deg)` }}>↑</span>
                    {windText}
                  </div>
                  <div className="taf-v3-data-ceil">{slot.clouds?.[0]?.base || "-"}ft</div>
                  <div className="taf-v3-data-vis">{slot.display?.visibility}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="taf-legacy-header">
        <span className="taf-new-validity">
          <span className="panel-kind-badge">{tafBadgeText}</span>
          <span>{tafTimeText}</span>
        </span>
        <div className="taf-view-toggle" role="tablist" aria-label="TAF view mode">
          <button
            type="button"
            className={`taf-view-toggle-btn${isTimelineView ? " active" : ""}`}
            onClick={() => onVersionToggle?.("v2")}
            aria-pressed={isTimelineView}
          >
            타임라인
          </button>
          <button
            type="button"
            className={`taf-view-toggle-btn${!isTimelineView ? " active" : ""}`}
            onClick={() => onVersionToggle?.("table")}
            aria-pressed={!isTimelineView}
          >
            테이블
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="taf-compact-table">
          <thead>
            <tr>
              <th>시간 ({tz})</th>
              <th>비행조건</th>
              <th>시정</th>
              <th>운고</th>
              <th>바람</th>
              <th>날씨</th>
            </tr>
          </thead>
          <tbody>
            {tableSegments.map((segment, i) => {
              const slot = segment.slot;
              const visibilityValue = slot.visibility?.value ?? null;
              const ceiling = getCeiling(slot);
              const flightCategory = getFlightCategory(visibilityValue, ceiling, icao, minimaSettings).category;
              const visibilityStyle = TINT_STYLE[classifyVisibilityCategory(visibilityValue, icao, minimaSettings).category];
              const ceilingStyle = TINT_STYLE[classifyCeilingCategory(ceiling, icao, minimaSettings).category];
              const weatherVisual = resolveWeatherVisual(slot, slot.time);
              const weatherLabel = convertWeatherToKorean(
                slot.display?.weather,
                slot.visibility?.cavok,
                slot.clouds || []
              );
              const isSpecialWeather = hasSpecialWeather(slot);
              const windRotation = (slot.wind?.direction || 0) + 180;
              const level = getSeverityLevel({
                visibility: visibilityValue,
                wind: slot.wind?.speed,
                gust: slot.wind?.gust,
              });

              return (
                <tr key={i} className={`row-${level}`}>
                  <td>{formatTafRange(segment.start, segment.end, tz)}</td>
                  <td className="taf-compact-table-cell taf-compact-table-cell--flight">
                    <span
                      className="taf-flight-badge"
                      style={{
                        backgroundColor: FC_COLORS[flightCategory] || FC_COLORS.VFR,
                        color: "#fff",
                      }}
                    >
                      {flightCategory}
                    </span>
                  </td>
                  <td className="taf-compact-table-cell" style={visibilityStyle}>
                    {formatVisibilityValue(visibilityValue, slot.display?.visibility)}
                  </td>
                  <td className="taf-compact-table-cell" style={ceilingStyle}>
                    {formatCeiling(ceiling)}
                  </td>
                  <td className="taf-table-center">
                    <span className="taf-wind-cell">
                      <span className="wind-arrow-inline" style={{ transform: `rotate(${windRotation}deg)` }}>↑</span>
                      <span>{safe(slot.display?.wind)}</span>
                    </span>
                  </td>
                  <td className="taf-table-center">
                    <span className={`taf-weather-cell${isSpecialWeather ? " taf-weather-cell--special" : ""}`}>
                      <WeatherIcon visual={weatherVisual} className="mini" />
                      <span>{weatherLabel}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

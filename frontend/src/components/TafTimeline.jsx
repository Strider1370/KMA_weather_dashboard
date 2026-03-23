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
  resolveIconKey,
  groupElementsByValue,
  convertWeatherToKorean,
} from "../utils/visual-mapper";

const FC_COLORS = { VFR: "#15803d", MVFR: "#2563eb", IFR: "#f59e0b", LIFR: "#7c3aed" };
const WEATHER_STYLE = { backgroundColor: "rgba(234, 179, 8, 0.10)", color: "#92400e" };
const WIND_STYLE = { backgroundColor: "var(--card-bg)", color: "var(--muted)" };
const TINT_STYLE = {
  VFR: { backgroundColor: "rgba(21, 128, 61, 0.08)", borderLeft: "3px solid #15803d", color: "#166534" },
  MVFR: { backgroundColor: "rgba(37, 99, 235, 0.08)", borderLeft: "3px solid #2563eb", color: "#1d4ed8" },
  IFR: { backgroundColor: "rgba(245, 158, 11, 0.08)", borderLeft: "3px solid #f59e0b", color: "#b45309" },
  LIFR: { backgroundColor: "rgba(124, 58, 237, 0.08)", borderLeft: "3px solid #7c3aed", color: "#6d28d9" },
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

function hasSpecialWeather(slot) {
  const raw = String(slot?.display?.weather || "").toUpperCase();
  return ["TS", "SH", "SN", "FG"].some((token) => raw.includes(token));
}

export default function TafTimeline({ tafData, icao, version = "v2", onVersionToggle, tz = "UTC" }) {
  const target = tafData?.airports?.[icao];
  const timeline = target?.timeline || [];

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
      return getFlightCategory(vis, ceil).category;
    });
    const weatherGroups = groupElementsByValue(timeline, (slot) =>
      convertWeatherToKorean(slot.display?.weather, slot.cavok)
    );
    const windGroups = groupElementsByValue(timeline, (slot) => {
      const wind = slot.wind;
      return `${wind?.direction ?? "VRB"}_${wind?.speed ?? 0}_${wind?.gust ?? 0}`;
    });
    const ceilingGroups = groupElementsByValue(timeline, (slot) => String(getCeiling(slot) ?? "null"));
    const visibilityGroups = groupElementsByValue(timeline, (slot) => String(slot.visibility?.value ?? "null"));

    const lastEnd = target.header?.valid_end;
    const tafTime = formatUtc(target.header?.valid_start, tz);
    const isAmd = target.header?.report_status === "AMENDMENT";
    const tafTimeText = tafTime || "";
    const tafBadgeText = isAmd ? "TAF AMD" : "TAF";

    return (
      <section className="taf-new-panel">
        <div className="taf-new-header">
          <span className="taf-new-title">공항예보(TAF) 타임라인</span>
          <span className="taf-new-validity">
            <span className="panel-kind-badge">{tafBadgeText}</span>
            <span>{tafTimeText}</span>
          </span>
        </div>
        <div className="taf-new-container">
          <div className="taf-new-row time-row">
            <div className="taf-new-label"></div>
            <div className="taf-new-scale">
              {timeline.map((slot, i) => {
                const dateObj = getDisplayDate(slot.time, tz);
                const hour = dateObj.getUTCHours();
                const isFirst = i === 0;
                const isNewDay = hour === 0;
                if (i % 3 === 0 || isFirst || isNewDay) {
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
                return (
                  <div
                    key={i}
                    className="taf-new-seg taf-new-seg--flight"
                    style={{
                      width: `${group.width}%`,
                      backgroundColor: FC_COLORS[category] || FC_COLORS.VFR,
                      color: "#fff",
                    }}
                  >
                    <span className="segment-label">{category}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--visibility">
            <div className="taf-new-label">날씨</div>
            <div className="taf-new-timeline">
              {weatherGroups.map((group, i) => (
                <div
                  key={i}
                  className={`taf-new-seg taf-new-seg--weather${hasSpecialWeather(group.data) ? " taf-new-seg--special-weather" : ""}`}
                  style={{ width: `${group.width}%`, ...WEATHER_STYLE }}
                >
                  <WeatherIcon iconKey={resolveIconKey(group.data, group.data.time)} className="mini" />
                  {group.hourCount >= 2 && <span className="segment-label">{group.value}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--ceiling">
            <div className="taf-new-label">바람</div>
            <div className="taf-new-timeline">
              {windGroups.map((group, i) => {
                const wind = group.data.wind;
                const windText = `${wind?.speed ?? 0}${wind?.gust ? `G${wind.gust}` : ""}kt`;
                const rotation = (wind?.direction || 0) + 180;
                return (
                  <div
                    key={i}
                    className="taf-new-seg taf-new-seg--wind"
                    style={{ width: `${group.width}%`, ...WIND_STYLE }}
                    title={`${wind?.direction ?? "VRB"}° ${windText}`}
                  >
                    <span className="wind-arrow-inline" style={{ transform: `rotate(${rotation}deg)` }}>↑</span>
                    {group.hourCount >= 2 && <span className="segment-label">{windText}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row">
            <div className="taf-new-label">시정</div>
            <div className="taf-new-timeline">
              {visibilityGroups.map((group, i) => {
                const vis = group.data.visibility?.value ?? null;
                const style = TINT_STYLE[classifyVisibilityCategory(vis).category];
                return (
                  <div
                    key={i}
                    className="taf-new-seg taf-new-seg--tint"
                    style={{ width: `${group.width}%`, ...style }}
                  >
                    {group.hourCount >= 2
                      ? <span className="segment-label">{formatVisibility(vis, group.data.display?.visibility)}</span>
                      : <span className="segment-label taf-new-seg-small">{formatVisibility(vis, group.data.display?.visibility)}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row">
            <div className="taf-new-label">운고</div>
            <div className="taf-new-timeline">
              {ceilingGroups.map((group, i) => {
                const ceiling = getCeiling(group.data);
                const style = TINT_STYLE[classifyCeilingCategory(ceiling).category];
                return (
                  <div
                    key={i}
                    className="taf-new-seg taf-new-seg--tint"
                    style={{ width: `${group.width}%`, ...style }}
                  >
                    {group.hourCount >= 2
                      ? <span className="segment-label">{formatCeiling(ceiling)}</span>
                      : <span className="segment-label taf-new-seg-small">{formatCeiling(ceiling)}</span>}
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
              const iconKey = resolveIconKey(slot, slot.time);
              const wind = slot.wind;
              const rotation = (wind?.direction || 0) + 180;
              const windText = `${wind?.speed}${wind?.gust ? `G${wind.gust}` : ""}kt`;
              return (
                <div key={i} className="taf-v3-card">
                  <div className="taf-v3-data-time">{getDisplayDate(slot.time, tz).getUTCHours()}시</div>
                  <div className="taf-v3-data-icon"><WeatherIcon iconKey={iconKey} /></div>
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
      <h3>공항예보 (TAF) 상세 테이블 - {icao}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time ({tz})</th>
              <th>Wind</th>
              <th>Visibility</th>
              <th>Weather</th>
              <th>Clouds</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((slot, i) => {
              const level = getSeverityLevel({
                visibility: slot.visibility?.value,
                wind: slot.wind?.speed,
                gust: slot.wind?.gust,
              });
              return (
                <tr key={i} className={`row-${level}`}>
                  <td>{formatUtc(slot.time, tz)}</td>
                  <td>{safe(slot.display?.wind)}</td>
                  <td>{safe(slot.display?.visibility)}</td>
                  <td>{safe(slot.display?.weather)}</td>
                  <td>{safe(slot.display?.clouds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import React from "react";
import { safe, formatUtc, getSeverityLevel, getDisplayDate } from "../utils/helpers";
import WeatherIcon from "./WeatherIcon";
import { 
  resolveIconKey, 
  groupElementsByValue, 
  convertWeatherToKorean 
} from "../utils/visual-mapper";

export default function TafTimeline({ tafData, icao, version = "v1", onVersionToggle, tz = "UTC" }) {
  const target = tafData?.airports?.[icao];
  const timeline = target?.timeline || [];

  const renderHeader = (title) => (
    <div className="taf-header-flex">
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div className="taf-version-toggle">
        <button 
          className={`dashboard-toggle-btn ${version === "v1" ? "active" : ""}`} 
          onClick={() => onVersionToggle?.("v1")}
          style={{ background: version === "v1" ? "var(--ink)" : "", color: version === "v1" ? "#fff" : "" }}
        >
          테이블
        </button>
        <button 
          className={`dashboard-toggle-btn ${version === "v2" ? "active" : ""}`} 
          onClick={() => onVersionToggle?.("v2")}
          style={{ background: version === "v2" ? "var(--ink)" : "", color: version === "v2" ? "#fff" : "" }}
        >
          타임라인
        </button>
        <button 
          className={`dashboard-toggle-btn ${version === "v3" ? "active" : ""}`} 
          onClick={() => onVersionToggle?.("v3")}
          style={{ background: version === "v3" ? "var(--ink)" : "", color: version === "v3" ? "#fff" : "" }}
        >
          그리드
        </button>
      </div>
    </div>
  );

  if (timeline.length === 0) {
    return (
      <section className="panel">
        <h3>공항예보 (TAF)</h3>
        <p>No TAF timeline data for selected airport.</p>
      </section>
    );
  }

  // TAF v2: Timeline Bar Mode
  if (version === "v2") {
    const weatherGroups = groupElementsByValue(timeline, (slot) => 
      convertWeatherToKorean(slot.display?.weather, slot.cavok)
    );
    const windGroups = groupElementsByValue(timeline, (slot) => {
      const w = slot.wind;
      return `${w?.direction ?? 'VRB'}_${w?.speed ?? 0}_${w?.gust ?? 0}`;
    });
    const getCeiling = (slot) =>
      slot.clouds
        ?.filter(c => c.amount === 'BKN' || c.amount === 'OVC')
        .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null;
    const fmtCeiling = (base) =>
      base != null ? String(Math.round(base / 100)).padStart(3, '0') : 'NSC';
    const ceilLvl = (c) => {
      if (c === null || c >= 5000) return 'ok';
      if (c >= 3000) return 'lime';
      if (c >= 1500) return 'warn';
      return 'danger';
    };
    const ceilingGroups = groupElementsByValue(timeline, (slot) => String(getCeiling(slot) ?? 'null'));
    const visLvl = (v) => {
      if (v === null || v >= 9999) return 'ok';
      if (v >= 5000) return 'lime';
      if (v >= 1000) return 'warn';
      return 'danger';
    };
    const visibilityGroups = groupElementsByValue(timeline, (slot) => String(slot.visibility?.value ?? 'null'));

    return (
      <section className="panel taf-v2">
        {renderHeader(`공항예보 (TAF${target.header?.report_status === 'AMENDMENT' ? ' AMD' : ''}) 타임라인 - ${icao}`)}
        <div className="taf-v2-container">
          {/* 시간 눈금 (날짜 표시 포함) */}
          <div className="taf-v2-row time-row">
            <div className="taf-v2-row-label">시간</div>
            <div className="taf-v2-timeline-scale">
              {timeline.map((slot, i) => {
                const dateObj = getDisplayDate(slot.time, tz);
                const hour = dateObj.getUTCHours();
                const isFirst = i === 0;
                const isNewDay = hour === 0;
                if (i % 3 === 0 || isFirst || isNewDay) {
                  return (
                    <div key={i} className="scale-item" style={{ left: `${(i / timeline.length) * 100}%` }}>
                      {(isFirst || isNewDay) && (
                        <span className="scale-date">{dateObj.getUTCDate()}일</span>
                      )}
                      <span className="scale-hour">{hour}시</span>
                    </div>
                  );
                }
                return null;
              })}
              {target.header?.valid_end && (() => {
                const endDate = getDisplayDate(target.header.valid_end, tz);
                return (
                  <div className="scale-item scale-end" style={{ left: '100%' }}>
                    <span className="scale-hour">{endDate.getUTCHours()}시</span>
                  </div>
                );
              })()}
            </div>
          </div>
          {/* 날씨 행 */}
          <div className="taf-v2-row">
            <div className="taf-v2-row-label">날씨</div>
            <div className="taf-v2-timeline">
              {weatherGroups.map((g, i) => (
                <div key={i} className="taf-v2-segment" style={{ width: `${g.width}%`, background: '#ffcc33', color: '#333' }}>
                  <WeatherIcon iconKey={resolveIconKey(g.data, g.data.time)} className="mini" />
                  {g.hourCount >= 2 && <span className="segment-label">{g.value}</span>}
                </div>
              ))}
            </div>
          </div>
          {/* 바람 행 */}
          <div className="taf-v2-row">
            <div className="taf-v2-row-label">바람</div>
            <div className="taf-v2-timeline">
              {windGroups.map((g, i) => {
                const wind = g.data.wind;
                const s = wind?.speed || 0;
                const lvl = s > 25 ? 'danger' : s > 15 ? 'warn' : 'ok';
                const windText = `${wind?.speed}${wind?.gust ? `G${wind.gust}` : ""}kt`;
                const rotation = (wind?.direction || 0) + 180;
                return (
                  <div key={i} className={`taf-v2-segment lvl-${lvl}`} style={{ width: `${g.width}%` }} title={`${wind?.direction ?? 'VRB'}° ${windText}`}>
                    <span className="wind-arrow-inline" style={{ transform: `rotate(${rotation}deg)` }}>↑</span>
                    {g.hourCount >= 2 && <span className="segment-label">{windText}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          {/* 운고 행 */}
          <div className="taf-v2-row">
            <div className="taf-v2-row-label">운고</div>
            <div className="taf-v2-timeline">
              {ceilingGroups.map((g, i) => {
                const c = getCeiling(g.data);
                return (
                  <div key={i} className={`taf-v2-segment lvl-${ceilLvl(c)}`} style={{ width: `${g.width}%` }}>
                    {g.hourCount >= 2
                      ? <span className="segment-label">{fmtCeiling(c)}</span>
                      : <span className="segment-label" style={{ fontSize: '0.65em' }}>{fmtCeiling(c)}</span>
                    }
                  </div>
                );
              })}
            </div>
          </div>
          {/* 시정 행 */}
          <div className="taf-v2-row">
            <div className="taf-v2-row-label">시정</div>
            <div className="taf-v2-timeline">
              {visibilityGroups.map((g, i) => {
                const v = g.data.visibility?.value ?? null;
                return (
                  <div key={i} className={`taf-v2-segment lvl-${visLvl(v)}`} style={{ width: `${g.width}%` }}>
                    {g.hourCount >= 2
                      ? <span className="segment-label">{g.data.display?.visibility}</span>
                      : <span className="segment-label" style={{ fontSize: '0.65em' }}>{g.data.display?.visibility}</span>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // TAF v3: Grid Mode (Visual Cards)
  if (version === "v3") {
    return (
      <section className="panel">
        {renderHeader(`공항예보 (TAF) 상세 그리드 - ${icao}`)}
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

  // TAF v1: Table Mode (Classic)
  return (
    <section className="panel">
      {renderHeader(`공항예보 (TAF) 상세 테이블 - ${icao}`)}
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

import { useMemo, useState, useEffect } from "react";
import { safe, toCanvasXY } from "../utils/helpers";
import { geoToSVGPaths } from "../utils/geoToSVG";

const TIME_OPTIONS = [
  { label: "10m", value: 10 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
];

const ZONE_RADII_KM = [
  { zone: "caution", km: 32, color: "#FFD700", label: "32km" },
  { zone: "danger", km: 16, color: "#FF8800", label: "16km" },
  { zone: "alert", km: 8, color: "#FF0000", label: "8km" },
];

function getStrikeColor(strikeTimeIso) {
  const elapsedMin = (Date.now() - new Date(strikeTimeIso).getTime()) / 60000;
  if (elapsedMin < 5) return { color: "#FF0000", opacity: 1 };
  if (elapsedMin < 10) return { color: "#FF6600", opacity: 0.85 };
  if (elapsedMin < 15) return { color: "#FFCC00", opacity: 0.8 };
  if (elapsedMin < 20) return { color: "#99CC00", opacity: 0.7 };
  if (elapsedMin < 30) return { color: "#33AA33", opacity: 0.6 };
  if (elapsedMin < 60) return { color: "#3366FF", opacity: 0.45 };
  return { color: "#999999", opacity: 0.25 };
}

function pickRunwayDirection(runwayHdg, windDir) {
  if (windDir == null) return runwayHdg;
  const opt1 = runwayHdg;
  const opt2 = (runwayHdg + 180) % 360;
  const diff1 = Math.abs(((windDir - opt1 + 180 + 360) % 360) - 180);
  const diff2 = Math.abs(((windDir - opt2 + 180 + 360) % 360) - 180);
  return diff1 <= diff2 ? opt1 : opt2;
}

export default function LightningMap({ lightningData, selectedAirport, airports, boundaryLevel = 'sigungu', windDir = null }) {
  const [timeRangeMin, setTimeRangeMin] = useState(30);
  const size = 260;
  const center = size / 2;
  const rangeKm = 32;
  const radiusScale = center / rangeKm;

  const [admDong, setAdmDong] = useState(null);

  useEffect(() => {
    if (!selectedAirport) return;
    setAdmDong(null);
    fetch(`/geo/${selectedAirport}_${boundaryLevel}.geojson`)
      .then(r => r.json())
      .then(setAdmDong)
      .catch(() => {});
  }, [selectedAirport, boundaryLevel]);

  const airportMeta = airports?.find(a => a.icao === selectedAirport) || null;
  const runwayHdg = airportMeta?.runway_hdg ?? 0;
  const effectiveHdg = pickRunwayDirection(runwayHdg, windDir);

  const airportData = lightningData?.airports?.[selectedAirport] || null;
  const arp = airportData?.arp || null;
  const strikes = airportData?.strikes || [];

  const visibleStrikes = useMemo(() => {
    const cutoff = Date.now() - timeRangeMin * 60 * 1000;
    return strikes.filter((s) => {
      const t = new Date(s.time).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [strikes, timeRangeMin]);

  const summary = useMemo(() => {
    const byZone = { alert: 0, danger: 0, caution: 0 };
    let latest = null;
    let nearest = null;

    for (const strike of visibleStrikes) {
      if (byZone[strike.zone] != null) byZone[strike.zone] += 1;
      if (!latest || strike.time > latest) latest = strike.time;
      if (strike.distance_km != null) {
        nearest = nearest == null ? strike.distance_km : Math.min(nearest, strike.distance_km);
      }
    }

    return {
      byZone,
      total: visibleStrikes.length,
      nearest,
      latest,
    };
  }, [visibleStrikes]);

  return (
    <aside className="panel lightning-panel">
      <div className="lightning-head">
        <h3>Lightning</h3>
        <div className="time-range">
          {TIME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === timeRangeMin ? "range-btn active" : "range-btn"}
              onClick={() => setTimeRangeMin(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!airportData || !arp ? (
        <p className="sub">Lightning data unavailable for this airport.</p>
      ) : (
        <>
          <div className="lightning-summary">
            <p><strong>{summary.total}</strong> strikes in last {timeRangeMin}m</p>
            <p>Nearest: {summary.nearest == null ? "-" : `${summary.nearest.toFixed(1)} km`}</p>
            <p>Latest: {safe(airportData?.summary?.latest_time || summary.latest, "-")}</p>
          </div>

          <svg
            className="lightning-map"
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`Lightning map for ${selectedAirport}`}
          >
            <defs>
              <clipPath id={`map-clip-${selectedAirport}`}>
                <rect x="0" y="0" width={size} height={size} rx="14" />
              </clipPath>
            </defs>
            <rect x="0" y="0" width={size} height={size} rx="14" fill="#131a24" />
            {admDong && arp && (
              <g clipPath={`url(#map-clip-${selectedAirport})`}>
                {geoToSVGPaths(admDong, arp, size, rangeKm).map(({ key, d }) => (
                  <path key={key} d={d} fill="#1e2d3d" stroke="#00cc66" strokeWidth="0.6" strokeOpacity="0.4" />
                ))}
              </g>
            )}
            {ZONE_RADII_KM.map((zone) => (
              <g key={zone.zone}>
                <circle
                  cx={center}
                  cy={center}
                  r={zone.km * radiusScale}
                  fill="none"
                  stroke={zone.color}
                  strokeDasharray="8 5"
                  strokeOpacity="0.65"
                  strokeWidth="1.5"
                />
                <text
                  x={center + zone.km * radiusScale + 4}
                  y={center - 6}
                  fill={zone.color}
                  fontSize="11"
                >
                  {zone.label}
                </text>
              </g>
            ))}
            <text
              x={center}
              y={center}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="18"
              fill="#ffffff"
              transform={`rotate(${effectiveHdg - 90}, ${center}, ${center})`}
            >
              ✈
            </text>

            {visibleStrikes.map((strike, idx) => {
              const { x, y } = toCanvasXY(strike, arp, size, rangeKm);
              const { color, opacity } = getStrikeColor(strike.time);
              return (
                <g key={`${strike.time}-${strike.lon}-${strike.lat}-${idx}`} stroke={color} strokeOpacity={opacity} strokeWidth="2">
                  <line x1={x - 5} y1={y} x2={x + 5} y2={y} />
                  <line x1={x} y1={y - 5} x2={x} y2={y + 5} />
                </g>
              );
            })}
          </svg>

          <div className="lightning-legend">
            <span className="zone-tag alert">8km {summary.byZone.alert}</span>
            <span className="zone-tag danger">16km {summary.byZone.danger}</span>
            <span className="zone-tag caution">32km {summary.byZone.caution}</span>
          </div>
        </>
      )}
    </aside>
  );
}

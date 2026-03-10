import { useState, useEffect, useMemo } from "react";
import { MapContainer, GeoJSON, CircleMarker, Circle, Marker, Pane, ImageOverlay, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { safe } from "../utils/helpers";

const TIME_OPTIONS = [
  { label: "10m", value: 10 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
];

const ZONE_RADII = [
  { zone: "caution", km: 32, color: "#FFD700", label: "32km" },
  { zone: "danger", km: 16, color: "#FF8800", label: "16km" },
  { zone: "alert", km: 8, color: "#FF0000", label: "8km" },
];

const BOUNDARY_STYLE = {
  fillColor: "#1e2d3d",
  color: "#00cc66",
  weight: 0.6,
  opacity: 0.4,
  fillOpacity: 0.8,
};

const DEFAULT_CENTER = [36.5, 127.5];
const DEFAULT_ZOOM = 10;

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

function MapRecenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function InteractiveMap({
  lightningData,
  selectedAirport,
  airports,
  boundaryLevel = "sigungu",
  windDir = null,
  echoMeta = null,
  rightPanelMode = "map",
  onPanelModeChange,
}) {
  const [timeRangeMin, setTimeRangeMin] = useState(30);
  const [geoData, setGeoData] = useState(null);
  const [showEcho, setShowEcho] = useState(true);
  const [echoOpacity, setEchoOpacity] = useState(0.7);

  useEffect(() => {
    if (!selectedAirport) return;
    setGeoData(null);
    fetch(`/geo/${selectedAirport}_${boundaryLevel}.geojson`)
      .then((r) => r.json())
      .then(setGeoData)
      .catch(() => {});
  }, [selectedAirport, boundaryLevel]);

  const airportMeta = airports?.find((a) => a.icao === selectedAirport) || null;
  const runwayHdg = airportMeta?.runway_hdg ?? 0;
  const effectiveHdg = pickRunwayDirection(runwayHdg, windDir);
  const airportData = lightningData?.airports?.[selectedAirport] || null;
  const arp = airportData?.arp || (airportMeta ? { lat: airportMeta.lat, lon: airportMeta.lon } : null);
  const strikes = airportData?.strikes || [];

  const center = arp ? [arp.lat, arp.lon] : DEFAULT_CENTER;

  const airportIcon = useMemo(() => {
    const rotation = effectiveHdg - 90;
    return L.divIcon({
      className: "leaflet-airport-icon",
      html: `<span style="display:inline-block;transform:rotate(${rotation}deg);font-size:20px;line-height:1;color:#ffffff;text-shadow:0 0 6px rgba(31,122,224,0.95)">✈</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, [effectiveHdg]);

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

    return { byZone, total: visibleStrikes.length, nearest, latest };
  }, [visibleStrikes]);

  const echoInfo = useMemo(() => {
    if (!echoMeta?.airports || !selectedAirport) return null;
    const info = echoMeta.airports[selectedAirport];
    if (!info?.path || !info?.bounds) return null;
    return {
      url: info.path + "?t=" + (echoMeta.tm || Date.now()),
      bounds: info.bounds,
      echoCount: info.echoCount || 0,
      tm: echoMeta.tm || null,
    };
  }, [echoMeta, selectedAirport]);

  return (
    <aside className="panel lightning-panel interactive-map-panel">
      <div className="lightning-head">
        <div className="panel-head-title">
          <div className="panel-switch" role="tablist" aria-label="Right panel mode">
            <button
              type="button"
              className={`panel-switch-btn ${rightPanelMode === "lightning" ? "active" : ""}`}
              onClick={() => onPanelModeChange?.("lightning")}
            >
              Lightning
            </button>
            <button
              type="button"
              className={`panel-switch-btn ${rightPanelMode === "radar" ? "active" : ""}`}
              onClick={() => onPanelModeChange?.("radar")}
            >
              Radar
            </button>
            <button
              type="button"
              className={`panel-switch-btn ${rightPanelMode === "map" ? "active" : ""}`}
              onClick={() => onPanelModeChange?.("map")}
            >
              Map
            </button>
          </div>
        </div>
        <div className="time-range">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={opt.value === timeRangeMin ? "range-btn active" : "range-btn"}
              onClick={() => setTimeRangeMin(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className={`range-btn echo-toggle ${showEcho ? "active" : ""}`}
            onClick={() => setShowEcho((v) => !v)}
            title={echoInfo ? `Radar echo (${echoInfo.echoCount} px)` : "Radar echo unavailable"}
            disabled={!echoInfo}
          >
            RDR
          </button>
        </div>
      </div>

      {!arp ? (
        <p className="sub">Lightning data unavailable for this airport.</p>
      ) : (
        <>
          <MapContainer
            center={center}
            zoom={DEFAULT_ZOOM}
            scrollWheelZoom={true}
            zoomControl={true}
            attributionControl={false}
            className="interactive-map-container"
          >
            <MapRecenter center={center} zoom={DEFAULT_ZOOM} />

            <Pane name="boundary-pane" style={{ zIndex: 350 }}>
              {geoData && (
                <GeoJSON
                  key={`${selectedAirport}-${boundaryLevel}`}
                  data={geoData}
                  style={() => BOUNDARY_STYLE}
                />
              )}
            </Pane>

            {showEcho && echoInfo && (
              <Pane name="echo-pane" style={{ zIndex: 400 }}>
                <ImageOverlay
                  url={echoInfo.url}
                  bounds={echoInfo.bounds}
                  opacity={echoOpacity}
                />
              </Pane>
            )}

            <Pane name="overlay-pane" style={{ zIndex: 450 }}>
              {ZONE_RADII.map((zone) => (
                <Circle
                  key={zone.zone}
                  center={center}
                  radius={zone.km * 1000}
                  pathOptions={{
                    color: zone.color,
                    dashArray: "8 5",
                    weight: 1.5,
                    opacity: 0.65,
                    fill: false,
                  }}
                />
              ))}
            </Pane>

            <Pane name="airport-pane" style={{ zIndex: 650 }}>
              <Marker position={center} icon={airportIcon} />
            </Pane>

            <Pane name="strike-pane" style={{ zIndex: 500 }}>
              {visibleStrikes.map((strike, idx) => {
                const { color, opacity } = getStrikeColor(strike.time);
                return (
                  <CircleMarker
                    key={`${strike.time}-${strike.lon}-${strike.lat}-${idx}`}
                    center={[strike.lat, strike.lon]}
                    radius={5}
                    pathOptions={{
                      color,
                      opacity,
                      fillColor: color,
                      fillOpacity: opacity * 0.8,
                      weight: 2,
                    }}
                  />
                );
              })}
            </Pane>
          </MapContainer>

          <div className="lightning-legend">
            <span className="zone-tag alert">8km {summary.byZone.alert}</span>
            <span className="zone-tag danger">16km {summary.byZone.danger}</span>
            <span className="zone-tag caution">32km {summary.byZone.caution}</span>
          </div>

          <div className="lightning-summary">
            {summary.total === 0 ? (
              <p>No strikes in last {timeRangeMin}m</p>
            ) : (
              <>
                <p><strong>{summary.total}</strong> strikes in last {timeRangeMin}m</p>
                <p>Nearest: {summary.nearest == null ? "-" : `${summary.nearest.toFixed(1)} km`}</p>
                <p>Latest: {safe(airportData?.summary?.latest_time || summary.latest, "-")}</p>
              </>
            )}
            {showEcho && echoInfo && (
              <p className="echo-status">
                Radar: {echoInfo.tm ? `${echoInfo.tm.slice(4, 6)}/${echoInfo.tm.slice(6, 8)} ${echoInfo.tm.slice(8, 10)}:${echoInfo.tm.slice(10, 12)} KST` : "-"}
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

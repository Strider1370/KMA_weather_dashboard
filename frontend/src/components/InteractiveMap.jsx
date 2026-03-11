import { useState, useEffect, useMemo } from "react";
import { MapContainer, GeoJSON, CircleMarker, Circle, Marker, Pane, ImageOverlay, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { safe } from "../utils/helpers";

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
const NATIONWIDE_CENTER = [36.2, 127.8];
const NATIONWIDE_ZOOM = 7;

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
  mapTheme = "dark",
  rightPanelMode = "map",
  onPanelModeChange,
}) {
  const [mapScope, setMapScope] = useState("airport");
  const [geoData, setGeoData] = useState(null);
  const [showEcho, setShowEcho] = useState(true);
  const [echoOpacity, setEchoOpacity] = useState(0.7);
  const isNationwide = mapScope === "nationwide";
  const timeRangeMin = 120;

  useEffect(() => {
    setGeoData(null);
    const geoPath = isNationwide
      ? "/geo/korea_sido.geojson"
      : selectedAirport
        ? `/geo/${selectedAirport}_${boundaryLevel}.geojson`
        : null;

    if (!geoPath) return;

    fetch(geoPath)
      .then((r) => r.json())
      .then(setGeoData)
      .catch(() => {});
  }, [selectedAirport, boundaryLevel, isNationwide]);

  const airportMeta = airports?.find((a) => a.icao === selectedAirport) || null;
  const runwayHdg = airportMeta?.runway_hdg ?? 0;
  const effectiveHdg = pickRunwayDirection(runwayHdg, windDir);
  const airportData = lightningData?.airports?.[selectedAirport] || null;
  const arp = airportData?.arp || (airportMeta ? { lat: airportMeta.lat, lon: airportMeta.lon } : null);
  const strikes = airportData?.strikes || [];

  const center = isNationwide
    ? NATIONWIDE_CENTER
    : arp
      ? [arp.lat, arp.lon]
      : DEFAULT_CENTER;
  const mapZoom = isNationwide ? NATIONWIDE_ZOOM : DEFAULT_ZOOM;

  const airportIcon = useMemo(() => {
    const rotation = effectiveHdg - 90;
    const iconColor = mapTheme === "light" ? "#111111" : "#ffffff";
    const iconShadow = mapTheme === "light"
      ? "0 0 6px rgba(255,255,255,0.95)"
      : "0 0 6px rgba(31,122,224,0.95)";
    return L.divIcon({
      className: "leaflet-airport-icon",
      html: `<span style="display:inline-block;transform:rotate(${rotation}deg);font-size:20px;line-height:1;color:${iconColor};text-shadow:${iconShadow}">✈</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, [effectiveHdg, mapTheme]);

  const visibleStrikes = useMemo(() => {
    const cutoff = Date.now() - timeRangeMin * 60 * 1000;
    const sourceStrikes = isNationwide
      ? Object.entries(lightningData?.airports || {}).flatMap(([icao, data]) =>
          (data?.strikes || []).map((strike) => ({ ...strike, airport: icao }))
        )
      : strikes;

    return sourceStrikes.filter((s) => {
      const t = new Date(s.time).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [isNationwide, lightningData, strikes, timeRangeMin]);

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

  const nationwideAirportMarkers = useMemo(() => {
    if (!isNationwide) return [];
    return (airports || []).filter((airport) => Number.isFinite(airport.lat) && Number.isFinite(airport.lon));
  }, [airports, isNationwide]);

  const boundaryStyle = useMemo(() => (
    mapTheme === "light"
      ? {
          fillColor: "#ffffff",
          color: "#111111",
          weight: 0.8,
          opacity: 0.55,
          fillOpacity: 0.9,
        }
      : BOUNDARY_STYLE
  ), [mapTheme]);

  const echoInfo = useMemo(() => {
    const info = isNationwide
      ? echoMeta?.nationwide
      : echoMeta?.airports?.[selectedAirport];
    if (!info?.path || !info?.bounds) return null;
    return {
      url: info.path + "?t=" + (echoMeta.tm || Date.now()),
      bounds: info.bounds,
      echoCount: info.echoCount || 0,
      tm: echoMeta.tm || null,
    };
  }, [echoMeta, isNationwide, selectedAirport]);

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
          <div className="panel-switch map-scope-switch" role="tablist" aria-label="Map scope">
            <button
              type="button"
              className={`panel-switch-btn ${!isNationwide ? "active" : ""}`}
              onClick={() => setMapScope("airport")}
            >
              Airport
            </button>
            <button
              type="button"
              className={`panel-switch-btn ${isNationwide ? "active" : ""}`}
              onClick={() => setMapScope("nationwide")}
            >
              Korea
            </button>
          </div>
        </div>
        <div className="time-range">
          <button
            type="button"
            className={`range-btn echo-toggle ${showEcho ? "active" : ""}`}
            onClick={() => setShowEcho((v) => !v)}
            title={echoInfo ? `Radar echo (${echoInfo.echoCount} px)` : isNationwide ? "Nationwide radar overlay unavailable" : "Radar echo unavailable"}
            disabled={!echoInfo}
          >
            RDR
          </button>
        </div>
      </div>

      {!isNationwide && !arp ? (
        <p className="sub">Lightning data unavailable for this airport.</p>
      ) : (
        <>
          <div className={`interactive-map-shell interactive-map-shell--${mapTheme}`}>
            <MapContainer
              key={`interactive-map-${mapTheme}`}
              center={center}
              zoom={mapZoom}
              scrollWheelZoom={true}
              zoomControl={true}
              attributionControl={false}
              className="interactive-map-container"
            >
              <MapRecenter center={center} zoom={mapZoom} />

            <Pane name="boundary-pane" style={{ zIndex: 350 }}>
              {geoData && (
                <GeoJSON
                  key={`${selectedAirport}-${boundaryLevel}`}
                  data={geoData}
                  style={() => boundaryStyle}
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
              {!isNationwide && ZONE_RADII.map((zone) => (
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
              {isNationwide ? (
                nationwideAirportMarkers.map((airport) => (
                  <CircleMarker
                    key={airport.icao}
                    center={[airport.lat, airport.lon]}
                    radius={airport.icao === selectedAirport ? 7 : 5}
                    pathOptions={{
                      color: airport.icao === selectedAirport ? "#ffd166" : "#ffffff",
                      weight: airport.icao === selectedAirport ? 2.5 : 1.5,
                      fillColor: airport.icao === selectedAirport ? "#1f7ae0" : mapTheme === "light" ? "#111111" : "#24425f",
                      fillOpacity: 0.9,
                    }}
                  />
                ))
              ) : (
                <Marker position={center} icon={airportIcon} />
              )}
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
          </div>

          <div className="lightning-legend">
            <span className="zone-tag alert">8km {summary.byZone.alert}</span>
            <span className="zone-tag danger">16km {summary.byZone.danger}</span>
            <span className="zone-tag caution">32km {summary.byZone.caution}</span>
          </div>

          <div className="lightning-summary">
            {summary.total === 0 ? (
              <p>No recent strikes</p>
            ) : (
              <>
                <p><strong>{summary.total}</strong> recent strikes</p>
                {!isNationwide && (
                  <p>Nearest: {summary.nearest == null ? "-" : `${summary.nearest.toFixed(1)} km`}</p>
                )}
                <p>Latest: {safe(isNationwide ? summary.latest : airportData?.summary?.latest_time || summary.latest, "-")}</p>
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

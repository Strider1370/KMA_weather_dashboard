import { useState, useEffect, useMemo } from "react";
import { MapContainer, GeoJSON, CircleMarker, Circle, Marker, Pane, ImageOverlay, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
const NATIONWIDE_ZOOM = 6;
const DEFAULT_FRAME_MS = 500;
const MIN_FRAME_MS = 100;
const MAX_FRAME_MS = 2000;
const FRAME_MS_STEP = 100;

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

function MapRecenter({ center, zoom, recenterKey }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom);
  }, [map, recenterKey]);
  return null;
}

function formatTmLabel(tm) {
  if (!tm || !/^\d{12}$/.test(tm)) return "-";
  return `${tm.slice(8, 10)}:${tm.slice(10, 12)}`;
}

function formatLightningSummary(summary, isNationwide) {
  if (summary.total === 0) return "No recent strikes";
  if (!isNationwide && summary.nearest != null) {
    return `${summary.total} recent strikes · nearest ${summary.nearest.toFixed(1)} km`;
  }
  return `${summary.total} recent strikes`;
}

export default function InteractiveMap({
  lightningData,
  selectedAirport,
  airports,
  windDir = null,
  echoMeta = null,
  radarOpacity = 0.6,
  mapTheme = "dark",
}) {
  const [mapScope, setMapScope] = useState("airport");
  const [geoData, setGeoData] = useState(null);
  const [neighborGeoData, setNeighborGeoData] = useState(null);
  const [showEcho, setShowEcho] = useState(true);
  const [showLightning, setShowLightning] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackMs, setPlaybackMs] = useState(DEFAULT_FRAME_MS);
  const [recenterKey, setRecenterKey] = useState(0);
  const isNationwide = mapScope === "nationwide";
  const timeRangeMin = 30;

  useEffect(() => {
    setGeoData(null);
    fetch("/geo/korea_sido.v1.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setNeighborGeoData(null);
    fetch("/geo/korea_neighbors_masked.v1.geojson")
      .then((r) => r.json())
      .then((data) => {
        const features = (data?.features || []).filter(
          (feature) => feature?.properties?.layer === "neighbors"
        );
        setNeighborGeoData({
          type: "FeatureCollection",
          features,
        });
      })
      .catch(() => {});
  }, []);

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

  const echoFrames = useMemo(() => echoMeta?.frames || [], [echoMeta]);
  const currentFrame = echoFrames[frameIndex] || echoMeta?.nationwide || null;
  const maxIndex = Math.max(echoFrames.length - 1, 0);
  const progressRatio = maxIndex > 0 ? (frameIndex / maxIndex) : 0;
  const canDecrementSpeed = playbackMs > MIN_FRAME_MS;
  const canIncrementSpeed = playbackMs < MAX_FRAME_MS;

  useEffect(() => {
    if (!echoFrames.length) {
      setFrameIndex(0);
      return;
    }

    if (isPlaying) {
      setFrameIndex((prev) => prev % echoFrames.length);
      return;
    }

    setFrameIndex(echoFrames.length - 1);
  }, [echoFrames, isPlaying]);

  useEffect(() => {
    if (!isPlaying || echoFrames.length <= 1) return undefined;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % echoFrames.length);
    }, playbackMs);
    return () => clearInterval(timer);
  }, [echoFrames.length, isPlaying, playbackMs]);

  useEffect(() => {
    if (!echoFrames.length) return undefined;

    const imageRefs = echoFrames
      .map((frame) => {
        if (!frame?.path) return null;
        const img = new Image();
        img.decoding = "async";
        img.src = frame.path;
        return img;
      })
      .filter(Boolean);

    return () => {
      imageRefs.forEach((img) => {
        img.src = "";
      });
    };
  }, [echoFrames]);

  function changePlaybackSpeed(delta) {
    setPlaybackMs((prev) => {
      const next = prev + delta;
      return Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, next));
    });
  }

  const echoInfo = useMemo(() => {
    if (!currentFrame?.path || !currentFrame?.bounds) return null;
    const isVersionedFrame = /echo_korea_\d{12}\.png$/.test(currentFrame.path);
    return {
      url: isVersionedFrame
        ? currentFrame.path
        : currentFrame.path + "?t=" + (currentFrame.tm || echoMeta?.tm || Date.now()),
      bounds: currentFrame.bounds,
      echoCount: currentFrame.echoCount || 0,
      tm: currentFrame.tm || echoMeta?.tm || null,
    };
  }, [currentFrame, echoMeta]);

  return (
    <aside className="panel lightning-panel interactive-map-panel">
      <div className="lightning-head">
        <div className="panel-switch map-scope-switch" role="tablist" aria-label="Map scope">
          <button
            type="button"
            className={`panel-switch-btn ${!isNationwide ? "active" : ""}`}
            onClick={() => {
              setMapScope("airport");
              setRecenterKey((prev) => prev + 1);
            }}
          >
            Airport
          </button>
          <button
            type="button"
            className={`panel-switch-btn ${isNationwide ? "active" : ""}`}
            onClick={() => {
              setMapScope("nationwide");
              setRecenterKey((prev) => prev + 1);
            }}
          >
            Korea
          </button>
        </div>
        <div className="time-range">
          <button
            type="button"
            className={`range-btn ${showLightning ? "active" : ""}`}
            onClick={() => setShowLightning((v) => !v)}
          >
            Lightning
          </button>
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
            {showLightning && (
              <div className="interactive-map-legend">
                <span className="zone-tag alert">8km {summary.byZone.alert}</span>
                <span className="zone-tag danger">16km {summary.byZone.danger}</span>
                <span className="zone-tag caution">32km {summary.byZone.caution}</span>
              </div>
            )}
            <MapContainer
              key={`interactive-map-${mapTheme}-${mapScope}`}
              center={center}
              zoom={mapZoom}
              scrollWheelZoom={true}
              zoomControl={true}
              attributionControl={false}
              className="interactive-map-container"
            >
              <MapRecenter center={center} zoom={mapZoom} recenterKey={recenterKey} />

            <Pane name="boundary-pane" style={{ zIndex: 350 }}>
              {geoData && (
                <GeoJSON
                  key="korea-sido-boundary"
                  data={geoData}
                  style={() => boundaryStyle}
                />
              )}
              {neighborGeoData && (
                <GeoJSON
                  key="neighbors-boundary"
                  data={neighborGeoData}
                  style={() => boundaryStyle}
                />
              )}
            </Pane>

            {showEcho && echoInfo && (
              <Pane name="echo-pane" style={{ zIndex: 400 }}>
                <ImageOverlay
                  url={echoInfo.url}
                  bounds={echoInfo.bounds}
                  opacity={radarOpacity}
                />
              </Pane>
            )}

            <Pane name="overlay-pane" style={{ zIndex: 450 }}>
              {showLightning && !isNationwide && ZONE_RADII.map((zone) => (
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
                arp && (
                  <CircleMarker
                    center={[arp.lat, arp.lon]}
                    radius={7}
                    pathOptions={{
                      color: "#ffd166",
                      weight: 2.5,
                      fillColor: "#1f7ae0",
                      fillOpacity: 0.9,
                    }}
                  />
                )
              ) : (
                <Marker position={center} icon={airportIcon} />
              )}
            </Pane>

            <Pane name="strike-pane" style={{ zIndex: 500 }}>
              {showLightning && visibleStrikes.map((strike, idx) => {
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

          {echoFrames.length > 0 && (
            <div className="radar-timeline">
              <div className="radar-controls">
                <div className="radar-speed-control">
                  <button
                    type="button"
                    className="radar-speed-step"
                    onClick={() => changePlaybackSpeed(-FRAME_MS_STEP)}
                    disabled={!canDecrementSpeed}
                    aria-label="재생시간 감소"
                  >
                    -
                  </button>
                  <span className="radar-speed-chip">재생시간 {(playbackMs / 1000).toFixed(1)}초</span>
                  <button
                    type="button"
                    className="radar-speed-step"
                    onClick={() => changePlaybackSpeed(FRAME_MS_STEP)}
                    disabled={!canIncrementSpeed}
                    aria-label="재생시간 증가"
                  >
                    +
                  </button>
                </div>
                {showLightning && (
                  <span className="radar-lightning-summary">
                    {formatLightningSummary(summary, isNationwide)}
                  </span>
                )}
              </div>
              <div className="radar-seek-wrap">
                <button
                  type="button"
                  className="radar-icon-btn radar-icon-inline"
                  onClick={() => setIsPlaying((prev) => !prev)}
                  disabled={echoFrames.length <= 1}
                  aria-label={isPlaying ? "Pause radar playback" : "Play radar playback"}
                  title={isPlaying ? "일시정지" : "재생"}
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <input
                  className="radar-seek"
                  type="range"
                  min={0}
                  max={maxIndex}
                  step={1}
                  value={Math.min(frameIndex, maxIndex)}
                  onChange={(event) => setFrameIndex(Number(event.target.value))}
                  aria-label="Radar timeline"
                />
                <div className="radar-time-row">
                  <span
                    className="radar-current-time"
                    style={{ "--radar-progress": progressRatio }}
                  >
                    {formatTmLabel(currentFrame?.tm)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

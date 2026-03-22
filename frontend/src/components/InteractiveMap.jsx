import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from "react";
import { MapContainer, GeoJSON, CircleMarker, Circle, Marker, Pane, ImageOverlay, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { feature as topoFeature } from "topojson-client";
import { circle as turfCircle, featureCollection, union as turfUnion } from "@turf/turf";
import "leaflet/dist/leaflet.css";

const ZONE_RADII = [
  { zone: "caution", km: 32, color: "#FFD700", label: "32km" },
  { zone: "danger", km: 16, color: "#FF8800", label: "16km" },
  { zone: "alert", km: 8, color: "#FF0000", label: "8km" },
];

const RAINRATE_LEGEND = [
  { label: "150", color: "rgb(51, 50, 59)" },
  { label: "110", color: "rgb(2, 4, 138)" },
  { label: "90", color: "rgb(75, 79, 170)" },
  { label: "70", color: "rgb(178, 180, 219)" },
  { label: "60", color: "rgb(141, 6, 219)" },
  { label: "50", color: "rgb(174, 44, 250)" },
  { label: "40", color: "rgb(201, 107, 248)" },
  { label: "30", color: "rgb(223, 170, 250)" },
  { label: "25", color: "rgb(174, 5, 7)" },
  { label: "20", color: "rgb(202, 4, 6)" },
  { label: "15", color: "rgb(246, 61, 4)" },
  { label: "10", color: "rgb(237, 118, 7)" },
  { label: "9", color: "rgb(211, 175, 10)" },
  { label: "8", color: "rgb(237, 196, 10)" },
  { label: "7", color: "rgb(251, 218, 32)" },
  { label: "6", color: "rgb(254, 247, 19)" },
  { label: "5", color: "rgb(18, 92, 5)" },
  { label: "4", color: "rgb(7, 135, 6)" },
  { label: "3", color: "rgb(6, 187, 8)" },
  { label: "2", color: "rgb(8, 250, 8)" },
  { label: "1.0", color: "rgb(4, 74, 231)" },
  { label: "0.5", color: "rgb(6, 153, 238)" },
  { label: "0.1", color: "rgb(8, 198, 246)" },
  { label: "0.0", color: "rgb(247, 252, 249)" },
];

const BOUNDARY_STYLE = {
  fillColor: "#1e2d3d",
  color: "#00cc66",
  weight: 0.6,
  opacity: 0.4,
  fillOpacity: 0.8,
};

const BOUNDARY_CASE_DARK = {
  fill: false,
  color: "#05090f",
  weight: 3.2,
  opacity: 0.84,
};

const BOUNDARY_LINE_DARK = {
  fill: false,
  color: "#9be2b8",
  weight: 1.3,
  opacity: 0.98,
};

const DEFAULT_CENTER = [36.5, 127.5];
const DEFAULT_ZOOM = 10;
const NATIONWIDE_CENTER = [36.2, 127.8];
const NATIONWIDE_ZOOM = 6;
const BOUNDARY_ZOOM_THRESHOLD = 9;

const RADAR_SITES = [
  { name: "백령도", coords: [124.629309, 37.966937], radiusKm: 240 },
  { name: "광덕산", coords: [127.433582, 38.117112], radiusKm: 240 },
  { name: "강릉", coords: [128.865815, 37.817706], radiusKm: 280 },
  { name: "관악산", coords: [126.945743, 37.455594], radiusKm: 240 },
  { name: "오성산", coords: [126.784179, 36.013268], radiusKm: 240 },
  { name: "면봉산", coords: [128.997306, 36.179395], radiusKm: 285 },
  { name: "진도", coords: [126.323801, 34.47255], radiusKm: 240 },
  { name: "구덕산", coords: [128.999739, 35.118713], radiusKm: 240 },
  { name: "성산", coords: [126.880259, 33.386949], radiusKm: 240 },
  { name: "고산", coords: [126.162982, 33.294199], radiusKm: 240 },
  { name: "영종도(인천공항)", coords: [126.363055, 37.465224], radiusKm: 120 },
];

const WORLD_OUTER_RING = [
  [85, -180],
  [85, 180],
  [-85, 180],
  [-85, -180],
  [85, -180],
];

// ── Module-level boundary cache (survives re-renders, zero re-fetch) ──
const _boundaryCache = {
  topology: null,       // raw TopoJSON object
  sido: null,           // topoFeature result for sido
  sigungu: null,        // topoFeature result for sigungu
  neighbors: null,      // neighbor GeoJSON
  loading: false,
  promise: null,        // dedup concurrent fetches
};

function loadBoundaries() {
  if (_boundaryCache.topology) return Promise.resolve(_boundaryCache);
  if (_boundaryCache.promise) return _boundaryCache.promise;

  _boundaryCache.loading = true;
  _boundaryCache.promise = fetch("/geo/korea_boundaries.v1.topojson")
    .then((r) => {
      if (!r.ok) throw new Error("topology not found");
      return r.json();
    })
    .then((topology) => {
      _boundaryCache.topology = topology;
      if (topology.objects?.sido) {
        _boundaryCache.sido = topoFeature(topology, topology.objects.sido);
      }
      if (topology.objects?.sigungu) {
        _boundaryCache.sigungu = topoFeature(topology, topology.objects.sigungu);
      }
      _boundaryCache.loading = false;
      return _boundaryCache;
    })
    .catch(() => {
      // fallback: try individual GeoJSON files
      _boundaryCache.loading = false;
      _boundaryCache.promise = null;
      return Promise.all([
        fetch("/geo/korea_sido.v1.geojson").then((r) => r.json()).catch(() => null),
        fetch("/geo/korea_sigungu.v1.geojson").then((r) => r.json()).catch(() => null),
      ]).then(([sido, sigungu]) => {
        if (sido) _boundaryCache.sido = sido;
        if (sigungu) _boundaryCache.sigungu = sigungu;
        return _boundaryCache;
      });
    });

  return _boundaryCache.promise;
}

function loadNeighbors() {
  if (_boundaryCache.neighbors) return Promise.resolve(_boundaryCache.neighbors);
  return fetch("/geo/korea_neighbors_masked.v1.geojson")
    .then((r) => r.json())
    .then((data) => {
      _boundaryCache.neighbors = data;
      return data;
    })
    .catch(() => null);
}
const DEFAULT_FRAME_MS = 500;
const MIN_FRAME_MS = 100;
const MAX_FRAME_MS = 2000;
const FRAME_MS_STEP = 100;
const AIRCRAFT_AIRPORT_RANGE_KM = 120;

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
  }, [map, center, zoom, recenterKey]);
  return null;
}

function ZoomBoundaryController({ onBoundaryChange }) {
  const map = useMap();
  useEffect(() => {
    function handleZoom() {
      const z = map.getZoom();
      onBoundaryChange(z >= BOUNDARY_ZOOM_THRESHOLD ? "sigungu" : "sido", z);
    }
    // set initial value from current zoom
    handleZoom();
    map.on("zoomend", handleZoom);
    return () => { map.off("zoomend", handleZoom); };
  }, [map, onBoundaryChange]);
  return null;
}

function toKnots(metersPerSecond) {
  if (typeof metersPerSecond !== "number" || !Number.isFinite(metersPerSecond)) return null;
  return metersPerSecond * 1.94384;
}

function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const x = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function createAircraftIcon(track = 0, mapTheme = "dark") {
  const rotation = (track || 0) - 90;
  const color = mapTheme === "light" ? "#0f1720" : "#ffffff";
  const glow = mapTheme === "light"
    ? "0 0 8px rgba(255,255,255,0.95)"
    : "0 0 8px rgba(15,23,32,0.45)";
  const size = 20;
  return L.divIcon({
    className: "leaflet-aircraft-icon",
    html: `<span style="display:inline-block;transform:rotate(${rotation}deg);color:${color};text-shadow:${glow};font-size:${size}px">&#9992;</span>`,
    iconSize: [size + 2, size + 2],
    iconAnchor: [(size + 2) / 2, (size + 2) / 2],
  });
}

function formatFlightLevel(aircraft) {
  const altitudeMeters = aircraft.geo_altitude ?? aircraft.baro_altitude;
  if (typeof altitudeMeters !== "number" || !Number.isFinite(altitudeMeters)) return "FL---";
  const altitudeFeet = altitudeMeters * 3.28084;
  return `FL${String(Math.round(altitudeFeet / 100)).padStart(3, "0")}`;
}

function formatHeading(track) {
  if (typeof track !== "number" || !Number.isFinite(track)) return "HDG ---";
  return `HDG ${String(Math.round(track)).padStart(3, "0")}`;
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
  adsbData = null,
  selectedAirport,
  airports,
  windDir = null,
  echoMeta = null,
  radarOpacity = 0.6,
  mapTheme = "dark",
}) {
  const [mapScope, setMapScope] = useState("airport");
  const [boundaryLevel, setBoundaryLevel] = useState("sido");
  const [currentZoom, setCurrentZoom] = useState(NATIONWIDE_ZOOM);
  const [, forceRender] = useReducer((x) => x + 1, 0);
  const [showEcho, setShowEcho] = useState(true);
  const [showLightning, setShowLightning] = useState(true);
  const [showTraffic, setShowTraffic] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMs, setPlaybackMs] = useState(DEFAULT_FRAME_MS);
  const [recenterKey, setRecenterKey] = useState(0);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const loopTrackRef = useRef(null);
  const draggingRef = useRef(null); // "start" | "end" | null
  const isNationwide = mapScope === "nationwide";
  const timeRangeMin = 30;

  // Load boundaries + neighbors once; forceRender when ready
  useEffect(() => {
    loadBoundaries().then(() => forceRender());
    loadNeighbors().then(() => forceRender());
  }, []);

  // Derive geoData directly from cache — no async, no stale closures
  const geoData = _boundaryCache[boundaryLevel] || null;
  const neighborGeoData = _boundaryCache.neighbors || null;

  const handleBoundaryChange = useCallback((level, zoom) => {
    setBoundaryLevel(level);
    if (typeof zoom === "number" && Number.isFinite(zoom)) {
      setCurrentZoom(zoom);
    }
  }, []);

  const airportMeta = airports?.find((a) => a.icao === selectedAirport) || null;
  const runwayHdg = airportMeta?.runway_hdg ?? 0;
  const effectiveHdg = pickRunwayDirection(runwayHdg, windDir);
  const airportData = lightningData?.airports?.[selectedAirport] || null;
  const arp = airportData?.arp || (airportMeta ? { lat: airportMeta.lat, lon: airportMeta.lon } : null);
  const strikes = airportData?.strikes || [];

  const center = useMemo(() => (
    isNationwide
      ? NATIONWIDE_CENTER
      : arp
        ? [arp.lat, arp.lon]
        : DEFAULT_CENTER
  ), [isNationwide, arp?.lat, arp?.lon]);
  const mapZoom = isNationwide ? NATIONWIDE_ZOOM : DEFAULT_ZOOM;

  useEffect(() => {
    setCurrentZoom(mapZoom);
  }, [mapZoom]);

  const strokeProfile = useMemo(() => {
    if (currentZoom < 7) {
      return {
        caseWeight: 2.3,
        caseOpacity: 0.72,
        lineWeight: 1,
        lineOpacity: 0.9,
      };
    }
    if (currentZoom < 9) {
      return {
        caseWeight: 2.9,
        caseOpacity: 0.8,
        lineWeight: 1.2,
        lineOpacity: 0.94,
      };
    }
    return {
      caseWeight: 3.4,
      caseOpacity: 0.88,
      lineWeight: 1.4,
      lineOpacity: 0.98,
    };
  }, [currentZoom]);

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

  // All strikes for map rendering — always nationwide regardless of mode
  const visibleStrikes = useMemo(() => {
    const cutoff = Date.now() - timeRangeMin * 60 * 1000;
    const nationwideStrikes = lightningData?.nationwide?.strikes;
    const source = Array.isArray(nationwideStrikes)
      ? nationwideStrikes
      : Object.entries(lightningData?.airports || {}).flatMap(([icao, data]) =>
          (data?.strikes || []).map((strike) => ({ ...strike, airport: icao }))
        );
    return source.filter((s) => {
      const t = new Date(s.time).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [lightningData, timeRangeMin]);

  const aircraft = useMemo(() => {
    return (adsbData?.aircraft || []).filter((item) => (
      typeof item?.lat === "number" &&
      typeof item?.lon === "number" &&
      item.on_ground !== true
    ));
  }, [adsbData]);

  const visibleAircraft = useMemo(() => {
    if (isNationwide) return aircraft;
    if (!arp) return [];
    return aircraft.filter((item) => haversineKm(
      { lat: arp.lat, lon: arp.lon },
      { lat: item.lat, lon: item.lon }
    ) <= AIRCRAFT_AIRPORT_RANGE_KM);
  }, [aircraft, arp, isNationwide]);

  // Zone counts from per-airport data in airport mode; total always from nationwide
  const summary = useMemo(() => {
    const byZone = { alert: 0, danger: 0, caution: 0 };
    let latest = null;
    let nearest = null;

    if (!isNationwide) {
      const cutoff = Date.now() - timeRangeMin * 60 * 1000;
      const airportStrikes = (strikes || []).filter((s) => {
        const t = new Date(s.time).getTime();
        return Number.isFinite(t) && t >= cutoff;
      });
      for (const strike of airportStrikes) {
        if (byZone[strike.zone] != null) byZone[strike.zone] += 1;
        if (!latest || strike.time > latest) latest = strike.time;
        if (strike.distance_km != null) {
          nearest = nearest == null ? strike.distance_km : Math.min(nearest, strike.distance_km);
        }
      }
    }

    return { byZone, total: visibleStrikes.length, nearest, latest };
  }, [isNationwide, strikes, visibleStrikes, timeRangeMin]);

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
  const neighborBoundaryStyle = useMemo(() => (
    mapTheme === "light"
      ? {
          fill: false,
          color: "#111111",
          weight: 0.8,
          opacity: 0.55,
        }
      : {
          fill: false,
          color: "#2ea56b",
          weight: 0.8,
          opacity: 0.58,
        }
  ), [mapTheme]);
  const boundaryCaseStyle = useMemo(() => (
    mapTheme === "light"
      ? {
          fill: false,
          color: "#ffffff",
          weight: strokeProfile.caseWeight,
          opacity: Math.min(1, strokeProfile.caseOpacity + 0.1),
        }
      : {
          ...BOUNDARY_CASE_DARK,
          weight: strokeProfile.caseWeight,
          opacity: strokeProfile.caseOpacity,
        }
  ), [mapTheme, strokeProfile]);
  const boundaryLineStyle = useMemo(() => (
    mapTheme === "light"
      ? {
          fill: false,
          color: "#111111",
          weight: strokeProfile.lineWeight,
          opacity: strokeProfile.lineOpacity,
        }
      : {
          ...BOUNDARY_LINE_DARK,
          weight: strokeProfile.lineWeight,
          opacity: strokeProfile.lineOpacity,
        }
  ), [mapTheme, strokeProfile]);
  const neighborBoundaryCaseStyle = useMemo(() => (
    mapTheme === "light"
      ? {
          fill: false,
          color: "#ffffff",
          weight: Math.max(1.5, strokeProfile.caseWeight - 0.4),
          opacity: Math.max(0.75, strokeProfile.caseOpacity),
        }
      : {
          fill: false,
          color: "#0b1320",
          weight: Math.max(1.5, strokeProfile.caseWeight - 0.4),
          opacity: Math.max(0.55, strokeProfile.caseOpacity - 0.06),
        }
  ), [mapTheme, strokeProfile]);
  const neighborBoundaryLineStyle = useMemo(() => (
    mapTheme === "light"
      ? {
          fill: false,
          color: "#111111",
          weight: Math.max(0.65, strokeProfile.lineWeight - 0.15),
          opacity: Math.max(0.72, strokeProfile.lineOpacity - 0.08),
        }
      : {
          ...neighborBoundaryStyle,
          weight: Math.max(0.65, strokeProfile.lineWeight - 0.15),
          opacity: Math.max(0.55, strokeProfile.lineOpacity - 0.12),
        }
  ), [mapTheme, neighborBoundaryStyle, strokeProfile]);
  const echoFrames = useMemo(() => echoMeta?.frames || [], [echoMeta]);
  const currentFrame = echoFrames[frameIndex] || echoMeta?.nationwide || null;
  const maxIndex = Math.max(echoFrames.length - 1, 0);
  const progressRatio = maxIndex > 0 ? (frameIndex / maxIndex) : 0;
  const loopStartPct = maxIndex > 0 ? (loopStart / maxIndex) * 100 : 0;
  const loopEndPct = maxIndex > 0 ? (loopEnd / maxIndex) * 100 : 100;
  const canDecrementSpeed = playbackMs > MIN_FRAME_MS;
  const canIncrementSpeed = playbackMs < MAX_FRAME_MS;
  const loopActive = loopStart !== 0 || loopEnd !== maxIndex;

  // Clamp loop bounds when echoFrames change
  useEffect(() => {
    setLoopStart(0);
    setLoopEnd(maxIndex);
  }, [maxIndex]);

  useEffect(() => {
    if (!echoFrames.length) {
      setFrameIndex(0);
      return;
    }

    if (isPlaying) {
      setFrameIndex((prev) => {
        const clamped = Math.min(prev, maxIndex);
        if (loopActive && (clamped < loopStart || clamped > loopEnd)) return loopStart;
        return clamped;
      });
      return;
    }

    setFrameIndex(echoFrames.length - 1);
  }, [echoFrames, isPlaying]);

  useEffect(() => {
    if (!isPlaying || echoFrames.length <= 1) return undefined;
    const effectiveStart = loopActive ? loopStart : 0;
    const effectiveEnd = loopActive ? loopEnd : maxIndex;
    const timer = setInterval(() => {
      setFrameIndex((prev) => {
        const next = prev + 1;
        if (next > effectiveEnd) return effectiveStart;
        return next;
      });
    }, playbackMs);
    return () => clearInterval(timer);
  }, [echoFrames.length, isPlaying, playbackMs, loopStart, loopEnd, loopActive, maxIndex]);

  const resolveLoopIndex = useCallback((clientX) => {
    const track = loopTrackRef.current;
    if (!track || maxIndex <= 0) return null;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * maxIndex);
  }, [maxIndex]);

  const handleLoopPointerDown = useCallback((which, e) => {
    e.preventDefault();
    draggingRef.current = which;
    let nextStart = loopStart;
    let nextEnd = loopEnd;

    const applyLoop = (start, end) => {
      nextStart = start;
      nextEnd = end;
      setLoopStart(start);
      setLoopEnd(end);
    };

    const onMove = (ev) => {
      const idx = resolveLoopIndex(ev.clientX);
      if (idx == null) return;
      if (draggingRef.current === "start") {
        applyLoop(Math.min(idx, nextEnd), nextEnd);
      } else {
        applyLoop(nextStart, Math.max(idx, nextStart));
      }
    };

    const onUp = () => {
      setFrameIndex((prev) => {
        if (prev < nextStart || prev > nextEnd) return nextStart;
        return prev;
      });
      draggingRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [resolveLoopIndex, loopStart, loopEnd]);

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

  const radarCoverageBoundary = useMemo(() => {
    if (!RADAR_SITES.length) return null;

    const siteCircles = RADAR_SITES.map((site) => (
      turfCircle(site.coords, site.radiusKm, { steps: 96, units: "kilometers" })
    ));
    let merged = siteCircles[0];

    for (let i = 1; i < siteCircles.length; i++) {
      const mergedResult = turfUnion(featureCollection([merged, siteCircles[i]]));
      if (mergedResult) merged = mergedResult;
    }

    return merged;
  }, []);

  const radarOutsideMaskPositions = useMemo(() => {
    if (!radarCoverageBoundary?.geometry) return null;

    const holes = [];
    const { geometry } = radarCoverageBoundary;

    if (geometry.type === "Polygon") {
      if (Array.isArray(geometry.coordinates?.[0])) {
        holes.push(geometry.coordinates[0].map(([lon, lat]) => [lat, lon]));
      }
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates || []) {
        if (Array.isArray(polygon?.[0])) {
          holes.push(polygon[0].map(([lon, lat]) => [lat, lon]));
        }
      }
    }

    if (!holes.length) return null;
    return [WORLD_OUTER_RING, ...holes];
  }, [radarCoverageBoundary]);

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
          <button
            type="button"
            className={`range-btn ${showTraffic ? "active" : ""}`}
            onClick={() => setShowTraffic((v) => !v)}
            title={adsbData ? `ADS-B traffic (${visibleAircraft.length})` : "Traffic layer unavailable"}
            disabled={!adsbData}
          >
            Traffic
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
                {!isNationwide ? (
                  <>
                    <span className="zone-tag alert">8km {summary.byZone.alert}</span>
                    <span className="zone-tag danger">16km {summary.byZone.danger}</span>
                    <span className="zone-tag caution">32km {summary.byZone.caution}</span>
                  </>
                ) : (
                  <span className="zone-tag caution">KR {summary.total}</span>
                )}
                {showTraffic && adsbData && (
                  <span className="zone-tag traffic">ACFT {visibleAircraft.length}</span>
                )}
              </div>
            )}
            {showEcho && echoInfo && (
              <div className="rainrate-legend" aria-label="Radar rain rate legend">
                <div className="rainrate-legend-title">mm/h</div>
                <div className="rainrate-legend-scale">
                  {RAINRATE_LEGEND.map((entry) => (
                    <div key={entry.label} className="rainrate-legend-row">
                      <span className="rainrate-legend-label">{entry.label}</span>
                      <span
                        className="rainrate-legend-swatch"
                        style={{ backgroundColor: entry.color }}
                        aria-hidden="true"
                      />
                    </div>
                  ))}
                </div>
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
              <ZoomBoundaryController onBoundaryChange={handleBoundaryChange} />

            {!showEcho && (
              <Pane name="boundary-fill-pane" style={{ zIndex: 350 }}>
                {geoData && (
                  <GeoJSON
                    key={`korea-boundary-fill-${boundaryLevel}`}
                    data={geoData}
                    style={() => boundaryStyle}
                  />
                )}
              </Pane>
            )}

            {showEcho && echoInfo && (
              <Pane name="echo-pane" style={{ zIndex: 400 }}>
                <ImageOverlay
                  url={echoInfo.url}
                  bounds={echoInfo.bounds}
                  opacity={radarOpacity}
                />
              </Pane>
            )}

            {showEcho && isNationwide && (
              <Pane name="radar-range-pane" style={{ zIndex: 420 }}>
                {radarOutsideMaskPositions && (
                  <Polygon
                    positions={radarOutsideMaskPositions}
                    pathOptions={{
                      stroke: false,
                      fill: true,
                      fillColor: "#05090f",
                      fillOpacity: mapTheme === "light" ? 0.13 : 0.22,
                      interactive: false,
                    }}
                  />
                )}
                {radarCoverageBoundary && (
                  <GeoJSON
                    key="radar-coverage-boundary"
                    data={radarCoverageBoundary}
                    style={() => ({
                      fill: false,
                      color: mapTheme === "light" ? "#5b6470" : "#8097aa",
                      weight: 1.2,
                      opacity: mapTheme === "light" ? 0.38 : 0.5,
                      dashArray: "4 8",
                    })}
                  />
                )}
              </Pane>
            )}

            <Pane name="boundary-case-pane" style={{ zIndex: 430 }}>
              {geoData && (
                <GeoJSON
                  key={`korea-boundary-case-${boundaryLevel}`}
                  data={geoData}
                  style={() => boundaryCaseStyle}
                />
              )}
              {neighborGeoData && (
                <GeoJSON
                  key="neighbors-boundary-case"
                  data={neighborGeoData}
                  style={() => neighborBoundaryCaseStyle}
                />
              )}
            </Pane>

            <Pane name="boundary-line-pane" style={{ zIndex: 440 }}>
              {geoData && (
                <GeoJSON
                  key={`korea-boundary-line-${boundaryLevel}`}
                  data={geoData}
                  style={() => boundaryLineStyle}
                />
              )}
              {neighborGeoData && (
                <GeoJSON
                  key="neighbors-boundary-line"
                  data={neighborGeoData}
                  style={() => neighborBoundaryLineStyle}
                />
              )}
            </Pane>

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

            <Pane name="traffic-pane" style={{ zIndex: 620 }}>
              {showTraffic && visibleAircraft.map((item) => (
                <Marker
                  key={item.icao24}
                  position={[item.lat, item.lon]}
                  icon={createAircraftIcon(item.true_track, mapTheme)}
                >
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                    <div className="aircraft-tooltip">
                      <strong>{item.callsign || item.icao24}</strong>
                      <div>{formatFlightLevel(item)}  {Math.round(toKnots(item.velocity) || 0)}kt</div>
                      <div>{formatHeading(item.true_track)}</div>
                    </div>
                  </Tooltip>
                </Marker>
              ))}
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
                <div className="radar-seek-track" ref={loopTrackRef}>
                  <input
                    className={`radar-seek${loopActive ? " loop-active" : ""}`}
                    type="range"
                    min={0}
                    max={maxIndex}
                    step={1}
                    value={Math.min(frameIndex, maxIndex)}
                    onChange={(event) => setFrameIndex(Number(event.target.value))}
                    style={loopActive ? {
                      "--loop-start-pct": `${loopStartPct}%`,
                      "--loop-end-pct": `${loopEndPct}%`,
                    } : undefined}
                    aria-label="Radar timeline"
                  />
                  {maxIndex > 1 && (
                    <div className="radar-loop-overlay" aria-hidden="true">
                      <div
                        className={`radar-loop-handle radar-loop-handle--start${loopActive ? " active" : ""}`}
                        style={{ left: `${loopStartPct}%` }}
                        onPointerDown={(e) => handleLoopPointerDown("start", e)}
                        title={`구간 시작: ${formatTmLabel(echoFrames[loopStart]?.tm)}`}
                      >
                        ▼
                      </div>
                      <div
                        className={`radar-loop-handle radar-loop-handle--end${loopActive ? " active" : ""}`}
                        style={{ left: `${loopEndPct}%` }}
                        onPointerDown={(e) => handleLoopPointerDown("end", e)}
                        title={`구간 종료: ${formatTmLabel(echoFrames[loopEnd]?.tm)}`}
                      >
                        ▼
                      </div>
                    </div>
                  )}
                </div>
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

import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from "react";
import { MapContainer, GeoJSON, CircleMarker, Circle, Marker, Pane, ImageOverlay, Polygon, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { feature as topoFeature } from "topojson-client";
import {
  bbox as turfBbox,
  booleanPointInPolygon as turfBooleanPointInPolygon,
  centerOfMass as turfCenterOfMass,
  circle as turfCircle,
  featureCollection,
  pointOnFeature as turfPointOnFeature,
  union as turfUnion,
} from "@turf/turf";
import { formatDateTimeRange, formatUtc } from "../utils/helpers";
import {
  sigwxCenter,
  sigwxLabelPosition,
  isSigwxArrowItem,
  sigwxLabel,
  sigwxNeedsLabelMarker,
  sigwxNeedsPath,
  buildSigwxGroups,
  sigwxAltitudeLabel,
  sigwxAltitudeParts,
  sigwxPhenomenonLabel,
  sigwxTypeLabel,
  sigwxStyle,
  smoothSigwxLatLngs,
} from "../utils/sigwx";
import { fetchSigwxLowClouds, fetchSigwxLowFronts } from "../utils/api";
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
const SATELLITE_BOUNDARY_CASE_COLOR = "#fff59d";
const SATELLITE_BOUNDARY_LINE_COLOR = "#fff200";

const DEFAULT_CENTER = [36.5, 127.5];
const DEFAULT_ZOOM = 10;
const NATIONWIDE_CENTER = [36.2, 127.8];
const NATIONWIDE_ZOOM = 6;
const BOUNDARY_ZOOM_THRESHOLD = 9;

const RADAR_SITES = [
  { name: "Baengnyeongdo", coords: [124.629309, 37.966937], radiusKm: 240 },
  { name: "Gwandeksan", coords: [127.433582, 38.117112], radiusKm: 240 },
  { name: "Gangneung", coords: [128.865815, 37.817706], radiusKm: 280 },
  { name: "Gwanaksan", coords: [126.945743, 37.455594], radiusKm: 240 },
  { name: "Seosan", coords: [126.784179, 36.013268], radiusKm: 240 },
  { name: "Myeonbongsan", coords: [128.997306, 36.179395], radiusKm: 285 },
  { name: "Jindo", coords: [126.323801, 34.47255], radiusKm: 240 },
  { name: "Gudeoksan", coords: [128.999739, 35.118713], radiusKm: 240 },
  { name: "Seongsan", coords: [126.880259, 33.386949], radiusKm: 240 },
  { name: "Gosan", coords: [126.162982, 33.294199], radiusKm: 240 },
  { name: "Yeongjongdo", coords: [126.363055, 37.465224], radiusKm: 120 },
];

const WORLD_OUTER_RING = [
  [85, -180],
  [85, 180],
  [-85, 180],
  [-85, -180],
  [85, -180],
];

// ?? Module-level boundary cache (survives re-renders, zero re-fetch) ??
const _boundaryCache = {
  topology: null,       // raw TopoJSON object
  sido: null,           // topoFeature result for sido
  sigungu: null,        // topoFeature result for sigungu
  neighbors: null,      // neighbor GeoJSON
  firDraft: null,
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

function loadFirDraft() {
  if (_boundaryCache.firDraft) return Promise.resolve(_boundaryCache.firDraft);
  return fetch("/geo/rkrr_fir.geojson")
    .then((r) => r.json())
    .then((data) => {
      _boundaryCache.firDraft = data;
      return data;
    })
    .catch(() => null);
}
const DEFAULT_FRAME_MS = 500;
const MIN_FRAME_MS = 100;
const MAX_FRAME_MS = 2000;
const FRAME_MS_STEP = 100;
const AIRCRAFT_AIRPORT_RANGE_KM = 120;
const framePreloadCache = new Map();

function preloadFrameImages(frames) {
  const imageRefs = [];

  for (const frame of frames) {
    if (!frame?.path) continue;
    if (framePreloadCache.has(frame.path)) continue;

    const img = new Image();
    img.decoding = "async";
    img.src = frame.path;
    framePreloadCache.set(frame.path, true);
    imageRefs.push(img);
  }

  return imageRefs;
}

function getStrikeColor(strikeTimeIso, referenceTimeMs) {
  const baseTimeMs = Number.isFinite(referenceTimeMs) ? referenceTimeMs : Date.now();
  const elapsedMin = (baseTimeMs - new Date(strikeTimeIso).getTime()) / 60000;
  if (elapsedMin < 0) return { color: "#999999", opacity: 0.2 };
  if (elapsedMin < 10) return { color: "#ff1f1f", opacity: 1 };
  if (elapsedMin < 20) return { color: "#ff00ff", opacity: 0.92 };
  if (elapsedMin < 30) return { color: "#2f55ff", opacity: 0.85 };
  if (elapsedMin < 40) return { color: "#1dd9e6", opacity: 0.78 };
  if (elapsedMin < 50) return { color: "#25d90a", opacity: 0.7 };
  if (elapsedMin <= 60) return { color: "#ffeb00", opacity: 0.62 };
  return { color: "#999999", opacity: 0.25 };
}

const LIGHTNING_LEGEND_BANDS = [
  { min: 0, max: 10, color: "#ff1f1f" },
  { min: 10, max: 20, color: "#ff00ff" },
  { min: 20, max: 30, color: "#2f55ff" },
  { min: 30, max: 40, color: "#1dd9e6" },
  { min: 40, max: 50, color: "#25d90a" },
  { min: 50, max: 60, color: "#ffeb00" },
];

function pickRunwayDirection(runwayHdg, windDir) {
  if (windDir == null) return runwayHdg;
  const opt1 = runwayHdg;
  const opt2 = (runwayHdg + 180) % 360;
  const diff1 = Math.abs(((windDir - opt1 + 180 + 360) % 360) - 180);
  const diff2 = Math.abs(((windDir - opt2 + 180 + 360) % 360) - 180);
  return diff1 <= diff2 ? opt1 : opt2;
}

function bboxToLeafletBounds(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (![minLon, minLat, maxLon, maxLat].every((value) => Number.isFinite(value))) return null;
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function MapRecenter({ center, zoom, bounds, boundsPadding = [24, 24], zoomOffset = 0, recenterKey }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      const latLngBounds = L.latLngBounds(bounds);
      const paddingPoint = L.point(boundsPadding[0], boundsPadding[1]);
      const computedZoom = map.getBoundsZoom(latLngBounds, false, paddingPoint) + zoomOffset;
      map.setView(latLngBounds.getCenter(), computedZoom);
      return;
    }
    if (center) map.setView(center, zoom);
  }, [map, recenterKey]);
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
  const color = "#FFD700";
  const outline = "-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000";
  const size = 20;
  return L.divIcon({
    className: "leaflet-aircraft-icon",
    html: `<span style="display:inline-block;transform:rotate(${rotation}deg);color:${color};text-shadow:${outline};font-size:${size}px">&#9992;</span>`,
    iconSize: [size + 2, size + 2],
    iconAnchor: [(size + 2) / 2, (size + 2) / 2],
  });
}

function createLightningIcon(color, opacity = 1, blink = false) {
  const safeOpacity = Number.isFinite(opacity) ? Math.max(0.2, Math.min(1, opacity)) : 1;
  return L.divIcon({
    className: "leaflet-lightning-icon",
    html: `
      <span class="leaflet-lightning-glyph${blink ? " leaflet-lightning-glyph--blink" : ""}" style="opacity:${safeOpacity};">
        <span class="leaflet-lightning-stroke leaflet-lightning-stroke--h" style="background:${color};"></span>
        <span class="leaflet-lightning-stroke leaflet-lightning-stroke--v" style="background:${color};"></span>
      </span>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
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

function formatReferenceTimeLabel(timeMs) {
  if (!Number.isFinite(timeMs)) return "--:--";
  const kst = new Date(timeMs + 9 * 60 * 60 * 1000);
  const hours = String(kst.getUTCHours()).padStart(2, "0");
  const minutes = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseFrameTmToMs(tm) {
  if (!tm || !/^\d{12}$/.test(String(tm))) return null;
  const raw = String(tm);
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    Number(raw.slice(10, 12)),
    0,
    0
  ));
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatLightningSummary(summary, isNationwide) {
  if (summary.total === 0) return "최근 낙뢰 없음";
  if (!isNationwide && summary.nearest != null) {
    return `최근 낙뢰 ${summary.total}회 · 최근접 ${summary.nearest.toFixed(1)}km`;
  }
  return `최근 낙뢰 ${summary.total}회`;
}

function advisoryPhenomenonIcon(code) {
  if (!code) return "!";
  if (code.includes("ICE")) return "ICE";
  if (code.includes("TURB") || code.includes("MTW") || code.includes("LLWS")) return "TURB";
  if (code.includes("TS") || code.includes("CB")) return "TS";
  if (code.includes("VA")) return "ASH";
  if (code.includes("IFR") || code.includes("OBSC")) return "VIS";
  return "!";
}

function advisoryIconAsset(item, kind) {
  const code = String(item?.phenomenon_code || "").toUpperCase();
  const basePath = kind === "sigmet" ? "/icon_SIGMET" : "/icon_AIRMET";

  if (kind === "sigmet") {
    if (code.includes("SEV_TURB")) return `${basePath}/SEV_TURB.png`;
    if (code.includes("SEV_ICE")) return `${basePath}/SEV_ICE.png`;
    if (code.includes("EMBD_TS")) return `${basePath}/EMBD_TS.png`;
    if (code.includes("ISOL_TS")) return `${basePath}/ISOL_TS.png`;
    if (code.includes("TSGR")) return `${basePath}/TSGR.png`;
    if (code === "TS" || code.includes(" TS")) return `${basePath}/TS.png`;
    if (code.includes("VA")) return `${basePath}/VA.png`;
    if (code.includes("RDOACT")) return `${basePath}/RDOACT.png`;
    if (code.includes("DS")) return `${basePath}/DS.png`;
    if (code.includes("SS")) return `${basePath}/SS.png`;
    if (code.includes("MTW")) return `${basePath}/MTW.png`;
    if (code.includes("ICE")) return `${basePath}/ICE.png`;
    if (code.includes("TURB")) return `${basePath}/TURB.png`;
    if (code.includes("TC")) {
      if (code.includes("6_24")) return `${basePath}/TC_6_24.png`;
      if (code.includes("12_24")) return `${basePath}/TC_12_24.png`;
      if (code.includes("18_24")) return `${basePath}/TC_18_24.png`;
      if (code.includes("24_24")) return `${basePath}/TC_24_24.png`;
      if (code.includes("24")) return `${basePath}/TC_24.png`;
      if (code.includes("48")) return `${basePath}/TC_48.png`;
      return `${basePath}/TC.png`;
    }
  }

  if (kind === "airmet") {
    if (code.includes("SFC_WIND") || code.includes("SFCWIND")) return `${basePath}/SFC_WIND.png`;
    if (code.includes("SFC_WSPD") || code.includes("SFCWSPD")) return `${basePath}/SFCWSPD.png`;
    if (code.includes("SFC_VIS") || code.includes("SFCVIS")) return `${basePath}/SFC_VIS.png`;
    if (code.includes("MTOBSC") || code.includes("OBSC")) return `${basePath}/MTOBSC.png`;
    if (code.includes("MTW")) return `${basePath}/MTW.png`;
    if (code.includes("TCU")) return `${basePath}/TCU.png`;
    if (code === "CB" || code.includes("_CB")) return `${basePath}/CB.png`;
    if (code.includes("CLD")) return `${basePath}/CLD.png`;
    if (code.includes("ISOL_TS")) return `${basePath}/ISOL_TS.png`;
    if (code.includes("TSGR")) return `${basePath}/TSGR.png`;
    if (code === "TS" || code.includes(" TS")) return `${basePath}/TS.png`;
    if (code.includes("MOD_ICE")) return `${basePath}/MOD_ICE.png`;
    if (code.includes("ICE")) return `${basePath}/ICE.png`;
    if (code.includes("MOD_TURB")) return `${basePath}/MOD_TURB.png`;
    if (code.includes("TURB")) return `${basePath}/TURB.png`;
  }

  if (code.includes("CNL") || code.includes("CANCEL")) {
    return `${basePath}/CANCEL.png`;
  }

  return null;
}

function advisoryPhenomenonLabel(code) {
  if (!code) return "ADV";
  if (code.includes("ICE")) return "ICING";
  if (code.includes("TURB")) return "TURB";
  if (code.includes("MTW")) return "MTW";
  if (code.includes("LLWS")) return "LLWS";
  if (code.includes("TS") || code.includes("CB")) return "TS";
  if (code.includes("VA")) return "ASH";
  if (code.includes("SFC_VIS")) return "VIS";
  if (code.includes("IFR")) return "IFR";
  if (code.includes("OBSC")) return "OBSC";
  return code.replace(/^SEV_/, "").replace(/^MOD_/, "").slice(0, 8);
}

function advisoryColor(item, kind) {
  const code = String(item?.phenomenon_code || "");
  const isSigmet = kind === "sigmet";
  let color = isSigmet ? "#ef4444" : "#fb923c";

  if (code.includes("ICE")) color = isSigmet ? "#06b6d4" : "#38bdf8";
  else if (code.includes("TURB") || code.includes("MTW") || code.includes("LLWS")) color = isSigmet ? "#f97316" : "#fb923c";
  else if (code.includes("TS") || code.includes("CB")) color = isSigmet ? "#ef4444" : "#f43f5e";
  else if (code.includes("VA")) color = isSigmet ? "#7c3aed" : "#8b5cf6";
  else if (code.includes("IFR") || code.includes("OBSC")) color = isSigmet ? "#64748b" : "#94a3b8";

  return color;
}

function advisoryStyle(item, kind, hovered) {
  const color = advisoryColor(item, kind);
  const isSigmet = kind === "sigmet";

  return {
    color,
    weight: hovered ? (isSigmet ? 2.8 : 2.2) : (isSigmet ? 2.1 : 1.7),
    opacity: hovered ? 1 : 0.9,
    fillColor: color,
    fillOpacity: hovered ? (isSigmet ? 0.3 : 0.24) : (isSigmet ? 0.12 : 0.08)
  };
}

function advisoryLabel(item) {
  return item?.phenomenon_label || item?.phenomenon_code || "Advisory";
}

function advisoryAltitudeLabel(item) {
  const lower = item?.altitude?.lower_fl;
  const upper = item?.altitude?.upper_fl;
  if (lower == null && upper == null) return "고도 정보 없음";
  if (lower != null && upper != null) return `FL${String(lower).padStart(3, "0")} - FL${String(upper).padStart(3, "0")}`;
  if (lower != null) return `ABV FL${String(lower).padStart(3, "0")}`;
  return `BLW FL${String(upper).padStart(3, "0")}`;
}

function advisoryAltitudeParts(item) {
  const lower = item?.altitude?.lower_fl;
  const upper = item?.altitude?.upper_fl;
  if (lower != null && upper != null) {
    return {
      upper: `FL${String(upper).padStart(3, "0")}`,
      lower: `FL${String(lower).padStart(3, "0")}`,
    };
  }
  return null;
}

function advisoryShowsAltitude(item) {
  const code = String(item?.phenomenon_code || "").toUpperCase();
  const label = String(item?.phenomenon_label || "").toUpperCase();
  if (code.includes("SFC_VIS") || code.includes("VIS")) return false;
  if (code.includes("SFC_WIND") || code.includes("SFCWIND") || code.includes("SFC_WSPD") || code.includes("SFCWSPD")) return false;
  if (label.includes("SURFACE VIS") || label.includes("SFC VIS") || label.includes("지상시정")) return false;
  if (label.includes("SURFACE WIND") || label.includes("SFC WIND") || label.includes("지상풍속")) return false;
  return true;
}

function advisoryValidLabel(item, tz) {
  return formatDateTimeRange(item?.valid_from, item?.valid_to, tz);
}

function advisoryItemKey(kind, item, index) {
  return String(
    item?.id ||
    item?.sequence_number ||
    `${kind}-${item?.phenomenon_code || "adv"}-${item?.valid_from || "na"}-${index}`
  );
}

function advisoryStatusLabel(item) {
  const bits = [];
  if (item?.time_indicator) bits.push(item.time_indicator === "OBSERVATION" ? "Observed" : "Forecast");
  if (item?.intensity_change) bits.push(item.intensity_change.replaceAll("_", " "));
  return bits.join(" 쨌 ") || "Active";
}

function geometryToLeafletPositions(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return (geometry.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((polygon) => (polygon?.[0] || []).map(([lon, lat]) => [lat, lon]));
  }
  return null;
}

function advisoryGeometryFeature(item) {
  const geometry = item?.geometry;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    return null;
  }

  return {
    type: "Feature",
    properties: {
      id: item?.id || null,
    },
    geometry,
  };
}

function featurePointToLeaflet(pointFeature) {
  const coords = pointFeature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function advisoryCenter(item) {
  const feature = advisoryGeometryFeature(item);
  if (feature) {
    try {
      const centerCandidate = turfCenterOfMass(feature);
      if (centerCandidate && turfBooleanPointInPolygon(centerCandidate, feature)) {
        return featurePointToLeaflet(centerCandidate);
      }
    } catch {
      // Fall through to point-on-feature and bbox fallback.
    }

    try {
      const surfacePoint = turfPointOnFeature(feature);
      const leafletPoint = featurePointToLeaflet(surfacePoint);
      if (leafletPoint) {
        return leafletPoint;
      }
    } catch {
      // Fall through to bbox fallback.
    }
  }

  const bbox = item?.bbox;
  if (bbox && [bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat].every((v) => Number.isFinite(v))) {
    return [(bbox.min_lat + bbox.max_lat) / 2, (bbox.min_lon + bbox.max_lon) / 2];
  }

  return null;
}

function formatIconAltitudeText(value) {
  return String(value || "").replace(/\bFL/g, "").replace(/\s+/g, " ").trim();
}

function createAdvisoryIcon(item, kind) {
  const label = advisoryPhenomenonLabel(item?.phenomenon_code);
  const iconAsset = advisoryIconAsset(item, kind);
  const inlineText = advisoryInlineText(item);
  const lines = advisoryMarkerLines(item, kind);
  const lineHtml = lines.length && !inlineText
    ? `<span class="leaflet-advisory-icon-text-chip leaflet-advisory-icon-text-chip--advisory">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</span>`
    : "";
  const motionArrowHtml = kind === "sigmet" ? advisoryMotionArrowSvg(item) : "";
  const maxLineLength = lines.length ? Math.max(...lines.map((line) => line.length)) : label.length;
  const isInlineMarker = Boolean(inlineText && iconAsset);
  const width = iconAsset
    ? Math.max(isInlineMarker ? 110 : 84, Math.min(kind === "sigmet" ? 170 : 156, 36 + (maxLineLength * 8) + (motionArrowHtml ? 34 : 0)))
    : Math.max(72, Math.min(118, 20 + (Math.max(label.length, maxLineLength) * 7)));
  const height = iconAsset ? (isInlineMarker ? 80 : (lineHtml ? 100 : 52)) : 24;
  const color = advisoryColor(item, kind);
  const labelHtml = iconAsset
    ? `<span class="leaflet-advisory-icon-symbol-wrap ${isInlineMarker ? "leaflet-advisory-icon-symbol-wrap--scale-2 leaflet-advisory-icon-symbol-wrap--advisory-inline" : "leaflet-advisory-icon-symbol-wrap--scale-advisory"}"><img class="leaflet-advisory-icon-symbol ${isInlineMarker ? "leaflet-advisory-icon-symbol--scale-2 leaflet-advisory-icon-symbol--advisory-inline" : "leaflet-advisory-icon-symbol--scale-advisory"}" src="${iconAsset}" alt="${escapeHtml(label)}" />${inlineText ? `<span class="leaflet-advisory-icon-inline-text">${escapeHtml(inlineText)}</span>` : ""}</span>`
    : `<span class="leaflet-advisory-icon-label">${escapeHtml(label)}</span>`;
  const motionInlineHtml = motionArrowHtml && kind === "sigmet"
    ? `<span class="leaflet-advisory-icon-motion-inline">${motionArrowHtml}<span class="leaflet-advisory-icon-motion-text">${escapeHtml(advisoryMotionCompact(item))}</span></span>`
    : motionArrowHtml;
  const contentHtml = iconAsset
    ? `<span class="leaflet-advisory-icon-stack">${motionInlineHtml ? `<span class="leaflet-advisory-icon-top-row"><span class="leaflet-advisory-icon-anchor-column">${labelHtml}</span>${motionInlineHtml}</span>${lineHtml ? `<span class="leaflet-advisory-icon-under-icon">${lineHtml}</span>` : ""}` : `${labelHtml}${lineHtml}`}</span>`
    : `<span class="leaflet-advisory-icon-badge" style="background:${color};"><span class="leaflet-advisory-icon-label">${escapeHtml(label)}</span></span>`;
  return L.divIcon({
    className: `leaflet-advisory-icon leaflet-advisory-icon--${kind}`,
    html: `<span class="leaflet-advisory-icon-shell">${contentHtml}</span>`,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), Math.round(height / 2)]
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SIGWX_ICON_EXCLUDED_PREFIXES = ["L_", "BOX_"];

function resolveSigwxIconAssets(iconName) {
  const candidates = String(iconName || "")
    .split("/")
    .map((value) => value.trim())
    .filter(Boolean);

  const assets = [];
  for (const candidate of candidates) {
    const upper = candidate.toUpperCase();
    if (SIGWX_ICON_EXCLUDED_PREFIXES.some((prefix) => upper.startsWith(prefix))) continue;
    assets.push(`/icon_sigwx/${encodeURIComponent(candidate)}`);
  }

  return assets;
}

function resolveSigwxSpecialIconAsset(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  const itemName = String(item?.item_name || "").toLowerCase();

  if (contour === "freezing_level") {
    return "/icon_sigwx/freezing_level.png";
  }

  if (contour === "sfc_wind" && itemName === "wind_strong") {
    return "/icon_sigwx/box_wind.png";
  }

  return null;
}

function advisoryAltitudeCompact(item) {
  const lower = item?.altitude?.lower_fl;
  const upper = item?.altitude?.upper_fl;
  if (lower != null && upper != null) return `FL${String(lower).padStart(3, "0")}/${String(upper).padStart(3, "0")}`;
  if (lower != null) return `ABV FL${String(lower).padStart(3, "0")}`;
  if (upper != null) return `BLW FL${String(upper).padStart(3, "0")}`;
  return "";
}

function advisoryMotionCompact(item) {
  const speed = item?.motion?.speed_kt;
  if (!Number.isFinite(speed) || speed <= 0) return "";
  return `${Math.round(speed)}KT`;
}

function advisorySurfaceWindCompact(item) {
  const dir = item?.surface_wind?.direction_deg;
  const speed = item?.surface_wind?.speed_kt;
  if (!Number.isFinite(dir) && !Number.isFinite(speed)) return "";
  const dirText = Number.isFinite(dir) ? String(Math.round(dir)).padStart(3, "0") : "///";
  const speedText = Number.isFinite(speed) ? `${Math.round(speed)}KT` : "--KT";
  return `${dirText}/${speedText}`;
}

function advisoryVisibilityCauseCompact(item) {
  const labels = Array.isArray(item?.surface_visibility_cause_labels) ? item.surface_visibility_cause_labels.filter(Boolean) : [];
  if (labels.length) return labels.join("/");
  const codes = Array.isArray(item?.surface_visibility_causes) ? item.surface_visibility_causes.filter(Boolean) : [];
  return codes.join("/");
}

function advisoryPhenomenonShortLabel(item) {
  const code = String(item?.phenomenon_code || "").toUpperCase();
  if (code.includes("SFC_VIS") || code.includes("SFCVIS")) return "SFC VIS";
  if (code.includes("SFC_WIND") || code.includes("SFCWIND")) return "SFC WIND";
  if (code.includes("SFC_WSPD") || code.includes("SFCWSPD")) return "SFC WSPD";
  if (code.includes("SEV_TURB")) return "SEV TURB";
  if (code.includes("MOD_TURB")) return "MOD TURB";
  if (code.includes("SEV_ICE")) return "SEV ICE";
  if (code.includes("MOD_ICE")) return "MOD ICE";
  if (code.includes("EMBD_TS")) return "EMBD TS";
  if (code.includes("ISOL_TS")) return "ISOL TS";
  if (code.includes("TSGR")) return "TSGR";
  if (code.includes("TCU")) return "TCU";
  if (code === "CB" || code.includes("_CB")) return "CB";
  if (code.includes("CLD")) return "CLD";
  if (code.includes("MTW")) return "MTW";
  if (code.includes("MTOBSC") || code.includes("OBSC")) return "MTOBSC";
  if (code.includes("VA")) return "VA";
  if (code.includes("RDOACT")) return "RDOACT";
  if (code.includes("DS")) return "DS";
  if (code.includes("SS")) return "SS";
  if (code.includes("TC")) return code;
  return advisoryPhenomenonLabel(code);
}

function advisoryMarkerLines(item, kind = null) {
  const code = String(item?.phenomenon_code || "").toUpperCase();
  const lines = [];
  const altitude = advisoryShowsAltitude(item) ? advisoryAltitudeCompact(item) : "";
  const motion = advisoryMotionCompact(item);
  const surfaceWind = advisorySurfaceWindCompact(item);
  const visCause = advisoryVisibilityCauseCompact(item);

  if (code.includes("SFC_VIS") || code.includes("SFCVIS")) {
    lines.push(advisoryPhenomenonShortLabel(item));
    if (visCause) lines.push(visCause);
    return lines;
  }

  if (code.includes("SFC_WIND") || code.includes("SFCWIND") || code.includes("SFC_WSPD") || code.includes("SFCWSPD")) {
    return lines;
  }

  if (code.includes("CB") || code.includes("TCU") || code.includes("CLD")) {
    lines.push(advisoryPhenomenonShortLabel(item));
    if (altitude) lines.push(altitude);
    return lines;
  }

  if (altitude) lines.push(altitude);
  if (motion && kind !== "sigmet") lines.push(motion);
  return lines;
}

function advisoryInlineText(item) {
  const code = String(item?.phenomenon_code || "").toUpperCase();
  if (code.includes("SFC_WIND") || code.includes("SFCWIND") || code.includes("SFC_WSPD") || code.includes("SFCWSPD")) {
    return advisorySurfaceWindCompact(item);
  }
  return "";
}

function advisoryMotionArrowSvg(item) {
  const direction = item?.motion?.direction_deg;
  const speed = item?.motion?.speed_kt;
  if (!Number.isFinite(direction) || !Number.isFinite(speed) || speed <= 0) return "";
  const rotation = Number(direction) - 90;
  return `<span class="advisory-motion-arrow" style="transform: rotate(${rotation}deg);"><svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="M6 20 H29 M20 11 L29 20 L20 29" fill="none" stroke="#111827" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>`;
}

function resolveSigwxMarkerIconAssets(item) {
  const special = resolveSigwxSpecialIconAsset(item);
  if (special) return [special];
  return resolveSigwxIconAssets(item?.icon_name);
}

function shouldHideSigwxIconAltitude(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  const itemName = String(item?.item_name || "").toLowerCase();
  if (contour === "sfc_wind" && itemName === "wind_strong") return true;
  if (contour === "freezing_level") return true;
  if (contour === "sfc_vis") {
    return [
      "rain",
      "fog",
      "widespread_fog",
      "widespread_mist",
      "widespread_fog/widespread_mist",
      "rain/widespread_fog/widespread_mist",
    ].includes(itemName);
  }
  return false;
}

function getSigwxIconScale(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  return contour === "freezing_level" ? 3 : 2;
}

function createSigwxBadgeIcon(item) {
  const label = sigwxPhenomenonLabel(item);
  const altitude = sigwxAltitudeLabel(item);
  const altitudeParts = sigwxAltitudeParts(item);
  const iconAssets = resolveSigwxMarkerIconAssets(item);
  const hasIconAssets = iconAssets.length > 0;
  const hideAltitude = shouldHideSigwxIconAltitude(item);
  const iconScale = getSigwxIconScale(item);
  const altitudeHtml = hideAltitude
    ? ""
    : altitudeParts
      ? `<span class="leaflet-advisory-icon-alt-stack"><span>${escapeHtml(formatIconAltitudeText(altitudeParts.upper))}</span><span class="leaflet-advisory-icon-alt-divider"></span><span>${escapeHtml(formatIconAltitudeText(altitudeParts.lower))}</span></span>`
      : altitude && altitude !== "-"
        ? `<span class="leaflet-advisory-icon-alt-single">${escapeHtml(formatIconAltitudeText(altitude))}</span>`
        : "";
  const maxLineLength = hasIconAssets
    ? (altitudeParts
        ? Math.max(formatIconAltitudeText(altitudeParts.upper).length, formatIconAltitudeText(altitudeParts.lower).length)
        : formatIconAltitudeText(altitude).length)
    : Math.max(
        label.length,
        altitudeParts
          ? Math.max(formatIconAltitudeText(altitudeParts.upper).length, formatIconAltitudeText(altitudeParts.lower).length)
          : formatIconAltitudeText(altitude).length
      );
  const width = hasIconAssets
    ? Math.max(48, Math.min(160, 20 + (maxLineLength * 8) + Math.max(0, iconAssets.length - 1) * 24))
    : Math.max(72, Math.min(118, 20 + (maxLineLength * 7)));
  const height = hasIconAssets
    ? (altitudeHtml ? (iconScale === 3 ? 92 : 72) : (iconScale === 3 ? 56 : 40))
    : (altitudeHtml ? 42 : 24);
  const labelHtml = hasIconAssets
    ? `<span class="leaflet-advisory-icon-symbol-row">${iconAssets.map((iconAsset, index) => `<span class="leaflet-advisory-icon-symbol-wrap leaflet-advisory-icon-symbol-wrap--scale-${iconScale}" data-icon-index="${index}"><img class="leaflet-advisory-icon-symbol leaflet-advisory-icon-symbol--scale-${iconScale}" src="${iconAsset}" alt="${escapeHtml(label)}" /></span>`).join("")}</span>`
    : `<span class="leaflet-advisory-icon-label">${escapeHtml(label)}</span>`;
  const contentHtml = hasIconAssets
    ? `<span class="leaflet-advisory-icon-stack">${labelHtml}${altitudeHtml ? `<span class="leaflet-advisory-icon-text-chip">${altitudeHtml}</span>` : ""}</span>`
    : `<span class="leaflet-advisory-icon-badge leaflet-advisory-icon-badge--sigwx">${labelHtml}${altitudeHtml}</span>`;
  return L.divIcon({
    className: "leaflet-advisory-icon leaflet-advisory-icon--sigwx",
    html: `<span class="leaflet-advisory-icon-shell" data-icon-name="${escapeHtml(item.icon_name || "")}">${contentHtml}</span>`,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), Math.round(height / 2)],
  });
}

function createSigwxArrowLabelIcon(label) {
  const safeLabel = escapeHtml(label || "");
  const width = Math.max(28, Math.min(78, 12 + String(label || "").length * 8));
  return L.divIcon({
    className: "sigwx-arrow-label-icon",
    html: `<span class="sigwx-arrow-label-badge">${safeLabel}</span>`,
    iconSize: [width, 24],
    iconAnchor: [Math.round(width / 2), 12],
  });
}

function formatSigwxMultilineLabel(rawLabel) {
  return String(rawLabel || "")
    .split("&#10;")
    .map((part) => part.trim())
    .filter(Boolean);
}

function shouldRenderSigwxTextLabel(item) {
  return Number(item?.item_type) === 4
    && String(item?.contour_name || "").toLowerCase() === "cld"
    && String(item?.item_name || "").toLowerCase() === "cloud"
    && /\bCB\b/i.test(String(item?.label || item?.text_label || "").replace(/&#10;/g, " "));
}

function isSigwxCloudGroup(group) {
  return String(group?.contour_name || "").toLowerCase() === "cld"
    && String(group?.item_name || "").toLowerCase() === "cloud"
    && /\bCB\b/i.test(String(group?.label || group?.text_label || "").replace(/&#10;/g, " "));
}

function isSigwxPressureGroup(group) {
  return String(group?.contour_name || "").toLowerCase() === "pressure";
}

function isSigwxStandaloneFrontGroup(group) {
  return String(group?.contour_name || "").toLowerCase() === "font_line";
}

function isSigwxPressureSystemItem(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  return contour === "pressure" || contour === "font_line";
}

function createSigwxPressureSystemGroup(items) {
  const members = items.filter((item) => isSigwxPressureSystemItem(item));
  if (!members.length) return null;

  const pressureItem = members.find((item) => String(item?.contour_name || "").toLowerCase() === "pressure") || members[0];
  const hasLow = members.some((item) => String(item?.item_name || "").toLowerCase() === "lx");
  const hasHigh = members.some((item) => String(item?.item_name || "").toLowerCase() === "hx");
  const groupLabel = hasLow
    ? "LOW PRESSURE"
    : hasHigh
      ? "HIGH PRESSURE"
      : "PRESSURE SYSTEM";

  return {
    ...pressureItem,
    mapKey: `sigwx-system-${hasLow ? "low-pressure" : hasHigh ? "high-pressure" : "pressure"}`,
    groupLabel,
    childItems: members.filter((item) => item.mapKey !== pressureItem.mapKey).map((item) => ({
      ...item,
      parentMapKey: `sigwx-system-${hasLow ? "low-pressure" : hasHigh ? "high-pressure" : "pressure"}`,
    })),
    isSyntheticSigwxGroup: true,
  };
}

function assignSigwxDisplayLabels(groups) {
  const counts = new Map();
  for (const group of groups) {
    const label = String(group?.groupLabel || "SIGWX");
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const seen = new Map();
  return groups.map((group) => {
    const label = String(group?.groupLabel || "SIGWX");
    const total = counts.get(label) || 0;
    if (total <= 1) return group;
    const nextIndex = (seen.get(label) || 0) + 1;
    seen.set(label, nextIndex);
    return {
      ...group,
      groupLabel: `${label} ${nextIndex}`,
    };
  });
}

function createSigwxTextLabelIcon(item) {
  const lines = formatSigwxMultilineLabel(item?.label || item?.text_label);
  const width = Math.max(54, Math.min(120, 28 + Math.max(...lines.map((line) => line.length), 4) * 7));
  const html = `<span class="sigwx-text-label-chip">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</span>`;
  return L.divIcon({
    className: "sigwx-text-label-icon",
    html,
    iconSize: [width, 18 + lines.length * 14],
    iconAnchor: [Math.round(width / 2), 10],
  });
}

function projectArrowHead(map, positions, sizePx = 16, spreadPx = 8) {
  if (!map || !Array.isArray(positions) || positions.length < 2) return null;
  const end = positions[positions.length - 1];
  const prev = positions[positions.length - 2];
  const endPoint = map.latLngToLayerPoint(end);
  const prevPoint = map.latLngToLayerPoint(prev);
  const dx = endPoint.x - prevPoint.x;
  const dy = endPoint.y - prevPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(length) || length < 0.001) return null;

  const ux = dx / length;
  const uy = dy / length;
  const baseX = endPoint.x - ux * sizePx;
  const baseY = endPoint.y - uy * sizePx;
  const px = -uy;
  const py = ux;

  const left = L.point(baseX + px * spreadPx, baseY + py * spreadPx);
  const right = L.point(baseX - px * spreadPx, baseY - py * spreadPx);

  return [
    map.layerPointToLatLng(endPoint),
    map.layerPointToLatLng(left),
    map.layerPointToLatLng(right),
  ];
}

function SigwxArrowAnnotation({ item, hovered, onHoverStart, onHoverEnd }) {
  const map = useMap();
  const positions = item.smoothedLatLngs?.length ? item.smoothedLatLngs : item.lat_lngs;
  const arrowHeadPositions = useMemo(
    () => projectArrowHead(map, positions),
    [map, positions]
  );
  const pathOptions = sigwxStyle(item, hovered);
  const arrowLabel = String(item?.label || "").trim();
  const endPosition = positions?.[positions.length - 1] || null;

  return (
    <>
      <Polyline
        key={`sigwx-arrow-line-${item.mapKey}`}
        positions={positions}
        pathOptions={pathOptions}
        eventHandlers={{
          mouseover: onHoverStart,
          mouseout: onHoverEnd,
        }}
      >
        <Tooltip sticky opacity={0.96} className="advisory-tooltip">
          <div className="advisory-tooltip-body">
            <strong>{sigwxPhenomenonLabel(item)}</strong>
            {renderSigwxAltitude(item)}
            <div className="advisory-tooltip-meta">{sigwxTypeLabel(item)}</div>
          </div>
        </Tooltip>
      </Polyline>
      {arrowHeadPositions && (
        <Polygon
          key={`sigwx-arrow-head-${item.mapKey}`}
          positions={arrowHeadPositions}
          pathOptions={{
            stroke: false,
            fill: true,
            fillColor: pathOptions.color,
            fillOpacity: hovered ? 0.95 : 0.88,
            interactive: false,
          }}
        />
      )}
      {arrowLabel && endPosition && (
        <Marker
          key={`sigwx-arrow-label-${item.mapKey}`}
          position={endPosition}
          icon={createSigwxArrowLabelIcon(arrowLabel)}
          interactive={false}
        />
      )}
    </>
  );
}

function renderSigwxAltitude(item) {
  const parts = sigwxAltitudeParts(item);
  if (!parts) return <div>{sigwxAltitudeLabel(item)}</div>;
  return (
    <div className="sigwx-altitude-stack">
      <span>{parts.upper}</span>
      <span className="sigwx-altitude-stack__divider" aria-hidden="true" />
      <span>{parts.lower}</span>
    </div>
  );
}

function parseSigwxTmfc(tmfc) {
  if (!tmfc || !/^\d{10}$/.test(String(tmfc))) return null;
  const raw = String(tmfc);
  return new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)),
    0,
    0,
    0
  ));
}

function sigwxIssueLabel(tmfc, tz) {
  const issueDate = parseSigwxTmfc(tmfc);
  return issueDate ? formatUtc(issueDate.toISOString(), tz) : "-";
}

function sigwxValidLabel(tmfc, tz) {
  const issueDate = parseSigwxTmfc(tmfc);
  if (!issueDate) return "-";
  const validDate = new Date(issueDate.getTime() + (7 * 60 * 60 * 1000));
  return formatUtc(validDate.toISOString(), tz);
}

export default function InteractiveMap({
  lightningData,
  sigwxLowData = null,
  sigwxLowHistoryData = null,
  sigwxLowFrontsData = null,
  sigwxLowCloudsData = null,
  sigmetData = null,
  airmetData = null,
  adsbData = null,
  selectedAirport,
  airports,
  windDir = null,
  echoMeta = null,
  satMeta = null,
  radarOpacity = 0.6,
  mapTheme = "dark",
  tz = "UTC",
  trafficCallsignFilter = "",
  trafficAltitudeBands = [],
}) {
  const [mapScope, setMapScope] = useState("nationwide");
  const [boundaryLevel, setBoundaryLevel] = useState("sido");
  const [currentZoom, setCurrentZoom] = useState(NATIONWIDE_ZOOM);
  const [, forceRender] = useReducer((x) => x + 1, 0);
  const [showEcho, setShowEcho] = useState(true);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showLightning, setShowLightning] = useState(false);
  const [blinkLightning, setBlinkLightning] = useState(false);
  const [showSigwxLow, setShowSigwxLow] = useState(false);
  const [showSigmet, setShowSigmet] = useState(false);
  const [showAirmet, setShowAirmet] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [hoveredAdvisoryId, setHoveredAdvisoryId] = useState(null);
  const [openAdvisoryPanel, setOpenAdvisoryPanel] = useState(null);
  const [hiddenAdvisoryKeys, setHiddenAdvisoryKeys] = useState({ sigwxLow: [], sigmet: [], airmet: [] });
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMs, setPlaybackMs] = useState(DEFAULT_FRAME_MS);
  const [recenterKey, setRecenterKey] = useState(0);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [sigwxHistoryIndex, setSigwxHistoryIndex] = useState(0);
  const [sigwxFrontMeta, setSigwxFrontMeta] = useState(sigwxLowFrontsData);
  const [sigwxCloudMeta, setSigwxCloudMeta] = useState(sigwxLowCloudsData);
  const loopTrackRef = useRef(null);
  const draggingRef = useRef(null); // "start" | "end" | null
  const isNationwide = mapScope === "nationwide";
  const timeRangeMin = 60;

  // Load boundaries + neighbors once; forceRender when ready
  useEffect(() => {
    loadBoundaries().then(() => forceRender());
    loadNeighbors().then(() => forceRender());
    loadFirDraft().then(() => forceRender());
  }, []);


  // Derive geoData directly from cache ??no async, no stale closures
  const geoData = _boundaryCache[boundaryLevel] || null;
  const neighborGeoData = _boundaryCache.neighbors || null;
  const firDraftGeoData = _boundaryCache.firDraft || null;

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
  const sigwxHistoryEntries = useMemo(() => {
    const history = Array.isArray(sigwxLowHistoryData) ? sigwxLowHistoryData : [];
    if (!sigwxLowData) return history;
    if (!history.length) return [sigwxLowData];

    const first = history[0];
    const sameEntry = (
      (sigwxLowData?.content_hash && first?.content_hash && sigwxLowData.content_hash === first.content_hash) ||
      (sigwxLowData?.tmfc && first?.tmfc && sigwxLowData.tmfc === first.tmfc)
    );

    return sameEntry ? history : [sigwxLowData, ...history];
  }, [sigwxLowData, sigwxLowHistoryData]);
  const selectedSigwxEntry = sigwxHistoryEntries[Math.min(sigwxHistoryIndex, Math.max(0, sigwxHistoryEntries.length - 1))] || null;
  const sigwxFrontInfo = useMemo(() => {
    const latest = sigwxFrontMeta?.latest;
    if (!latest?.path || !latest?.bounds) return null;
    const cacheKey = [
      latest?.tmfc,
      sigwxFrontMeta?.updated_at,
    ].filter(Boolean).join(":");
    return {
      url: `${latest.path}?t=${encodeURIComponent(cacheKey || String(Date.now()))}`,
      bounds: latest.bounds,
    };
  }, [sigwxFrontMeta]);
  const sigwxCloudInfo = useMemo(() => {
    const latest = sigwxCloudMeta?.latest;
    if (!latest?.path || !latest?.bounds) return null;
    const cacheKey = [
      latest?.tmfc,
      sigwxCloudMeta?.updated_at,
    ].filter(Boolean).join(":");
    return {
      url: `${latest.path}?t=${encodeURIComponent(cacheKey || String(Date.now()))}`,
      bounds: latest.bounds,
    };
  }, [sigwxCloudMeta]);

  useEffect(() => {
    setSigwxFrontMeta(sigwxLowFrontsData);
  }, [sigwxLowFrontsData]);

  useEffect(() => {
    setSigwxCloudMeta(sigwxLowCloudsData);
  }, [sigwxLowCloudsData]);

  useEffect(() => {
    let cancelled = false;
    const tmfc = selectedSigwxEntry?.tmfc || null;

    fetchSigwxLowFronts(tmfc).then((payload) => {
      if (cancelled) return;
      setSigwxFrontMeta(payload);
    }).catch(() => {
      if (cancelled) return;
      setSigwxFrontMeta(null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedSigwxEntry?.tmfc]);

  useEffect(() => {
    let cancelled = false;
    const tmfc = selectedSigwxEntry?.tmfc || null;

    fetchSigwxLowClouds(tmfc).then((payload) => {
      if (cancelled) return;
      setSigwxCloudMeta(payload);
    }).catch(() => {
      if (cancelled) return;
      setSigwxCloudMeta(null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedSigwxEntry?.tmfc]);

  const center = useMemo(() => (
    isNationwide
      ? NATIONWIDE_CENTER
      : arp
        ? [arp.lat, arp.lon]
        : DEFAULT_CENTER
  ), [isNationwide, arp?.lat, arp?.lon]);
  const mapZoom = isNationwide ? NATIONWIDE_ZOOM : DEFAULT_ZOOM;
  const airportFocusBounds = useMemo(() => {
    if (!arp) return null;
    return bboxToLeafletBounds(turfBbox(
      turfCircle([arp.lon, arp.lat], 32, { steps: 96, units: "kilometers" })
    ));
  }, [arp]);

  useEffect(() => {
    setCurrentZoom(mapZoom);
  }, [mapZoom]);

  useEffect(() => {
    setSigwxHistoryIndex((prev) => Math.min(prev, Math.max(0, sigwxHistoryEntries.length - 1)));
  }, [sigwxHistoryEntries]);

  useEffect(() => {
    setRecenterKey((prev) => prev + 1);
  }, [selectedAirport]);

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
      html: `<span style="display:inline-block;transform:rotate(${rotation}deg);font-size:20px;line-height:1;color:${iconColor};text-shadow:${iconShadow}">&#9992;</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, [effectiveHdg, mapTheme]);

  const aircraft = useMemo(() => {
    const normalizedFilters = String(trafficCallsignFilter || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const selectedBands = Array.isArray(trafficAltitudeBands) ? trafficAltitudeBands : [];
    return (adsbData?.aircraft || []).filter((item) => (
      typeof item?.lat === "number" &&
      typeof item?.lon === "number" &&
      item.on_ground !== true &&
      (
        normalizedFilters.length === 0 ||
        normalizedFilters.some((filterValue) =>
          String(item?.callsign || "").trim().toUpperCase().includes(filterValue)
        )
      ) &&
      (
        selectedBands.length === 0
          ? false
          : (() => {
              const altitudeMeters = Number.isFinite(item?.baro_altitude)
                ? item.baro_altitude
                : (Number.isFinite(item?.geo_altitude) ? item.geo_altitude : null);
              if (!Number.isFinite(altitudeMeters)) return false;

              const altitudeFeet = altitudeMeters * 3.28084;
              return selectedBands.some((band) => {
                const [minText, maxText] = String(band).split("-");
                const min = Number(minText);
                const max = Number(maxText);
                if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
                return altitudeFeet >= min && altitudeFeet < max;
              });
            })()
      )
    ));
  }, [adsbData, trafficCallsignFilter, trafficAltitudeBands]);

  const visibleAircraft = useMemo(() => {
    if (isNationwide) return aircraft;
    if (!arp) return [];
    return aircraft.filter((item) => haversineKm(
      { lat: arp.lat, lon: arp.lon },
      { lat: item.lat, lon: item.lon }
    ) <= AIRCRAFT_AIRPORT_RANGE_KM);
  }, [aircraft, arp, isNationwide]);

  const sigwxLowItems = useMemo(() => (
    (selectedSigwxEntry?.items || [])
      .filter((item) => item?.lat_lngs?.length > 0)
      .map((item, index) => ({
        ...item,
        mapKey: `sigwx-low-${index}`,
        smoothedLatLngs: smoothSigwxLatLngs(item.lat_lngs, item.curve_tension, item.is_close),
      }))
  ), [selectedSigwxEntry]);
  const sigwxLowGroups = useMemo(() => buildSigwxGroups(sigwxLowItems), [sigwxLowItems]);
  const sigwxPressureSystemGroup = useMemo(() => createSigwxPressureSystemGroup(sigwxLowItems), [sigwxLowItems]);
  const sigwxPanelGroups = useMemo(() => (
    assignSigwxDisplayLabels([
      ...sigwxLowGroups.filter((group) => !isSigwxStandaloneFrontGroup(group) && !isSigwxPressureGroup(group)),
      ...(sigwxPressureSystemGroup ? [sigwxPressureSystemGroup] : []),
    ])
  ), [sigwxLowGroups, sigwxPressureSystemGroup]);
  const sigwxLowParentMap = useMemo(() => {
    const next = new Map();
    for (const group of sigwxLowGroups) {
      next.set(group.mapKey, group.mapKey);
      for (const child of group.childItems || []) {
        next.set(child.mapKey, group.mapKey);
      }
    }
    if (sigwxPressureSystemGroup) {
      next.set(sigwxPressureSystemGroup.mapKey, sigwxPressureSystemGroup.mapKey);
      const pressureMembers = sigwxLowItems.filter((item) => isSigwxPressureSystemItem(item));
      for (const member of pressureMembers) {
        next.set(member.mapKey, sigwxPressureSystemGroup.mapKey);
      }
    }
    return next;
  }, [sigwxLowGroups, sigwxPressureSystemGroup, sigwxLowItems]);
  const resolveSigwxHoverKey = useCallback((item) => (
    sigwxLowParentMap.get(item?.mapKey) || item?.parentMapKey || item?.mapKey || null
  ), [sigwxLowParentMap]);
  const sigmetItems = useMemo(() => (
    (sigmetData?.items || [])
      .filter((item) => item?.geometry)
      .map((item, index) => ({ ...item, mapKey: advisoryItemKey("sigmet", item, index) }))
  ), [sigmetData]);
  const airmetItems = useMemo(() => (
    (airmetData?.items || [])
      .filter((item) => item?.geometry)
      .map((item, index) => ({ ...item, mapKey: advisoryItemKey("airmet", item, index) }))
  ), [airmetData]);
  const showFirDraft = isNationwide && (showSigwxLow || showSigmet || showAirmet) && firDraftGeoData;
  const advisoryBadgeItems = useMemo(() => ([
    showSigwxLow ? { key: "sigwxLow", badgeClass: "sigwx-low", label: "SIGWX_LOW", count: sigwxPanelGroups.length } : null,
    showSigmet ? { key: "sigmet", label: "SIGMET", count: sigmetItems.length } : null,
    showAirmet ? { key: "airmet", label: "AIRMET", count: airmetItems.length } : null
  ].filter((item) => item && item.count > 0)), [showSigwxLow, showSigmet, showAirmet, sigwxPanelGroups.length, sigmetItems.length, airmetItems.length]);
  const advisoryPanelItems = useMemo(() => {
    if (openAdvisoryPanel === "sigwxLow") return sigwxPanelGroups;
    if (openAdvisoryPanel === "sigmet") return sigmetItems;
    if (openAdvisoryPanel === "airmet") return airmetItems;
    return [];
  }, [openAdvisoryPanel, sigwxPanelGroups, sigmetItems, airmetItems]);
  const visibleSigwxLowItems = useMemo(() => {
    const hidden = new Set(hiddenAdvisoryKeys.sigwxLow);
    return sigwxLowItems.filter((item) => !hidden.has(sigwxLowParentMap.get(item.mapKey) || item.mapKey));
  }, [hiddenAdvisoryKeys.sigwxLow, sigwxLowItems, sigwxLowParentMap]);
  const hiddenSigwxLowKeys = useMemo(() => new Set(hiddenAdvisoryKeys.sigwxLow), [hiddenAdvisoryKeys.sigwxLow]);
  const visibleSigwxPanelGroups = useMemo(() => (
    sigwxPanelGroups.filter((group) => !hiddenSigwxLowKeys.has(group.mapKey))
  ), [sigwxPanelGroups, hiddenSigwxLowKeys]);
  const showVisibleSigwxFrontOverlay = useMemo(() => (
    visibleSigwxPanelGroups.some((group) => isSigwxPressureGroup(group))
  ), [visibleSigwxPanelGroups]);
  const showVisibleSigwxCloudOverlay = useMemo(() => (
    visibleSigwxPanelGroups.some((group) => isSigwxCloudGroup(group))
  ), [visibleSigwxPanelGroups]);
  const visibleSigmetItems = useMemo(() => {
    const hidden = new Set(hiddenAdvisoryKeys.sigmet);
    return sigmetItems.filter((item) => !hidden.has(item.mapKey));
  }, [hiddenAdvisoryKeys.sigmet, sigmetItems]);
  const visibleAirmetItems = useMemo(() => {
    const hidden = new Set(hiddenAdvisoryKeys.airmet);
    return airmetItems.filter((item) => !hidden.has(item.mapKey));
  }, [hiddenAdvisoryKeys.airmet, airmetItems]);

  useEffect(() => {
    if (openAdvisoryPanel === "sigwxLow" && !showSigwxLow) setOpenAdvisoryPanel(null);
    if (openAdvisoryPanel === "sigmet" && !showSigmet) setOpenAdvisoryPanel(null);
    if (openAdvisoryPanel === "airmet" && !showAirmet) setOpenAdvisoryPanel(null);
  }, [openAdvisoryPanel, showSigwxLow, showSigmet, showAirmet]);

  useEffect(() => {
      setHiddenAdvisoryKeys((prev) => {
      const sigwxLowKeySet = new Set(sigwxPanelGroups.map((item) => item.mapKey));
      const sigmetKeySet = new Set(sigmetItems.map((item) => item.mapKey));
      const airmetKeySet = new Set(airmetItems.map((item) => item.mapKey));
      const nextSigwxLow = prev.sigwxLow.filter((key) => sigwxLowKeySet.has(key));
      const nextSigmet = prev.sigmet.filter((key) => sigmetKeySet.has(key));
      const nextAirmet = prev.airmet.filter((key) => airmetKeySet.has(key));
      if (nextSigwxLow.length === prev.sigwxLow.length && nextSigmet.length === prev.sigmet.length && nextAirmet.length === prev.airmet.length) {
        return prev;
      }
      return { sigwxLow: nextSigwxLow, sigmet: nextSigmet, airmet: nextAirmet };
    });
  }, [sigwxPanelGroups, sigmetItems, airmetItems]);

  function toggleAdvisoryVisibility(kind, mapKey) {
    setHiddenAdvisoryKeys((prev) => {
      const current = new Set(prev[kind] || []);
      if (current.has(mapKey)) {
        current.delete(mapKey);
      } else {
        current.add(mapKey);
      }
      return {
        ...prev,
        [kind]: Array.from(current),
      };
    });
  }

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
    showSatellite
      ? {
          fill: false,
          color: SATELLITE_BOUNDARY_CASE_COLOR,
          weight: strokeProfile.caseWeight,
          opacity: Math.min(1, strokeProfile.caseOpacity + 0.08),
        }
      : mapTheme === "light"
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
  ), [mapTheme, showSatellite, strokeProfile]);
  const boundaryLineStyle = useMemo(() => (
    showSatellite
      ? {
          fill: false,
          color: SATELLITE_BOUNDARY_LINE_COLOR,
          weight: strokeProfile.lineWeight,
          opacity: Math.max(0.82, strokeProfile.lineOpacity),
        }
      : mapTheme === "light"
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
  ), [mapTheme, showSatellite, strokeProfile]);
  const neighborBoundaryCaseStyle = useMemo(() => (
    showSatellite
      ? {
          fill: false,
          color: SATELLITE_BOUNDARY_CASE_COLOR,
          weight: Math.max(1.5, strokeProfile.caseWeight - 0.4),
          opacity: Math.max(0.78, strokeProfile.caseOpacity),
        }
      : mapTheme === "light"
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
  ), [mapTheme, showSatellite, strokeProfile]);
  const neighborBoundaryLineStyle = useMemo(() => (
    showSatellite
      ? {
          fill: false,
          color: SATELLITE_BOUNDARY_LINE_COLOR,
          weight: Math.max(0.65, strokeProfile.lineWeight - 0.15),
          opacity: Math.max(0.78, strokeProfile.lineOpacity - 0.02),
        }
      : mapTheme === "light"
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
  ), [mapTheme, neighborBoundaryStyle, showSatellite, strokeProfile]);
  const echoFrames = useMemo(() => echoMeta?.frames || [], [echoMeta]);
  const satFrames = useMemo(() => satMeta?.frames || [], [satMeta]);

  // Determine which frame source drives the timeline
  const activeFrames = useMemo(() => {
    if (showEcho && echoFrames.length > 0) return echoFrames;
    if (showSatellite && satFrames.length > 0) return satFrames;
    return echoFrames;
  }, [showEcho, showSatellite, echoFrames, satFrames]);

  const currentEchoFrame = echoFrames[frameIndex] || echoMeta?.nationwide || null;

  // Map satellite frame from timeline: when echo drives timeline, find closest sat frame by tm
  const currentSatFrame = useMemo(() => {
    if (!satFrames.length) return satMeta?.latest || null;
    // Satellite drives timeline directly
    if (activeFrames === satFrames) return satFrames[frameIndex] || satFrames[satFrames.length - 1];
    // Echo drives timeline — find closest satellite frame by timestamp
    const activeTm = activeFrames[frameIndex]?.tm;
    if (!activeTm) return satFrames[satFrames.length - 1];
    let best = satFrames[0];
    for (const sf of satFrames) {
      if (sf.tm <= activeTm) best = sf;
      else break;
    }
    return best;
  }, [satFrames, satMeta, activeFrames, frameIndex]);

  const maxIndex = Math.max(activeFrames.length - 1, 0);
  const progressRatio = maxIndex > 0 ? (frameIndex / maxIndex) : 0;
  const loopStartPct = maxIndex > 0 ? (loopStart / maxIndex) * 100 : 0;
  const loopEndPct = maxIndex > 0 ? (loopEnd / maxIndex) * 100 : 100;
  const canDecrementSpeed = playbackMs > MIN_FRAME_MS;
  const canIncrementSpeed = playbackMs < MAX_FRAME_MS;
  const loopActive = loopStart !== 0 || loopEnd !== maxIndex;

  // Clamp loop bounds when active frames change
  useEffect(() => {
    setLoopStart(0);
    setLoopEnd(maxIndex);
  }, [maxIndex]);

  useEffect(() => {
    if (!activeFrames.length) {
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

    setFrameIndex(activeFrames.length - 1);
  }, [activeFrames, isPlaying]);

  useEffect(() => {
    if (!isPlaying || activeFrames.length <= 1) return undefined;
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
  }, [activeFrames.length, isPlaying, playbackMs, loopStart, loopEnd, loopActive, maxIndex]);

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
    const imageRefs = [
      ...preloadFrameImages(echoFrames),
      ...preloadFrameImages(satFrames),
    ];

    return () => {
      imageRefs.forEach((img) => {
        img.src = "";
      });
    };
  }, [echoFrames, satFrames]);

  function changePlaybackSpeed(delta) {
    setPlaybackMs((prev) => {
      const next = prev + delta;
      return Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, next));
    });
  }

  const echoInfo = useMemo(() => {
    if (!currentEchoFrame?.path || !currentEchoFrame?.bounds) return null;
    const isVersionedFrame = /echo_korea_\d{12}\.png$/.test(currentEchoFrame.path);
    return {
      url: isVersionedFrame
        ? currentEchoFrame.path
        : currentEchoFrame.path + "?t=" + (currentEchoFrame.tm || echoMeta?.tm || Date.now()),
      bounds: currentEchoFrame.bounds,
      echoCount: currentEchoFrame.echoCount || 0,
      tm: currentEchoFrame.tm || echoMeta?.tm || null,
    };
  }, [currentEchoFrame, echoMeta]);

  const satInfo = useMemo(() => {
    if (!currentSatFrame?.path || !currentSatFrame?.bounds) return null;
    const isVersioned = /sat_korea_\d{12}\.(?:png|webp)$/.test(currentSatFrame.path);
    return {
      url: isVersioned
        ? currentSatFrame.path
        : currentSatFrame.path + "?t=" + (currentSatFrame.tm || satMeta?.tm || Date.now()),
      bounds: currentSatFrame.bounds,
      tm: currentSatFrame.tm || satMeta?.tm || null,
    };
  }, [currentSatFrame, satMeta]);
  const lastGoodSatInfoRef = useRef(null);

  useEffect(() => {
    if (satInfo) {
      lastGoodSatInfoRef.current = satInfo;
    }
  }, [satInfo]);

  const displaySatInfo = satInfo || lastGoodSatInfoRef.current;
  const lightningReferenceTimeMs = useMemo(() => {
    const activeFrameTm = activeFrames[frameIndex]?.tm || null;
    const activeFrameTimeMs = parseFrameTmToMs(activeFrameTm);
    if (Number.isFinite(activeFrameTimeMs)) return activeFrameTimeMs;

    const echoTm = currentEchoFrame?.tm || echoMeta?.tm || null;
    const echoTimeMs = parseFrameTmToMs(echoTm);
    if (Number.isFinite(echoTimeMs)) return echoTimeMs;

    const satTm = currentSatFrame?.tm || satMeta?.tm || null;
    const satTimeMs = parseFrameTmToMs(satTm);
    if (Number.isFinite(satTimeMs)) return satTimeMs;

    return Date.now();
  }, [activeFrames, frameIndex, currentEchoFrame, echoMeta, currentSatFrame, satMeta]);

  const visibleStrikes = useMemo(() => {
    const cutoff = lightningReferenceTimeMs - timeRangeMin * 60 * 1000;
    const nationwideStrikes = lightningData?.nationwide?.strikes;
    const source = Array.isArray(nationwideStrikes)
      ? nationwideStrikes
      : Object.entries(lightningData?.airports || {}).flatMap(([icao, data]) =>
          (data?.strikes || []).map((strike) => ({ ...strike, airport: icao }))
        );
    return source.filter((s) => {
      const t = new Date(s.time).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= lightningReferenceTimeMs;
    });
  }, [lightningData, lightningReferenceTimeMs, timeRangeMin]);

  const lightningLegendEntries = useMemo(() => (
    LIGHTNING_LEGEND_BANDS.map((band) => ({
      ...band,
      label: formatReferenceTimeLabel(lightningReferenceTimeMs - band.max * 60 * 1000),
    }))
  ), [lightningReferenceTimeMs]);

  // Zone counts from per-airport data in airport mode; total always from nationwide
  const summary = useMemo(() => {
    const byZone = { alert: 0, danger: 0, caution: 0 };
    let latest = null;
    let nearest = null;

    if (!isNationwide) {
      const cutoff = lightningReferenceTimeMs - timeRangeMin * 60 * 1000;
      const airportStrikes = (strikes || []).filter((s) => {
        const t = new Date(s.time).getTime();
        return Number.isFinite(t) && t >= cutoff && t <= lightningReferenceTimeMs;
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
  }, [isNationwide, strikes, visibleStrikes, timeRangeMin, lightningReferenceTimeMs]);

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
  const radarCoverageBounds = useMemo(() => (
    radarCoverageBoundary ? bboxToLeafletBounds(turfBbox(radarCoverageBoundary)) : null
  ), [radarCoverageBoundary]);
  const mapBounds = isNationwide ? radarCoverageBounds : airportFocusBounds;
  const mapBoundsPadding = isNationwide ? [4, 4] : [4, 4];
  const mapZoomOffset = isNationwide ? 0.05 : 0.08;

  return (
    <aside className={`panel lightning-panel interactive-map-panel ${isNationwide ? "interactive-map-panel--korea" : "interactive-map-panel--airport"}`}>
      <div className="lightning-head">
        <div className="panel-switch map-scope-switch" role="tablist" aria-label="지도 범위">
          <button
            type="button"
            className={`panel-switch-btn ${isNationwide ? "active" : ""}`}
            onClick={() => {
              setMapScope("nationwide");
              setRecenterKey((prev) => prev + 1);
            }}
          >
            전국
          </button>
          <button
            type="button"
            className={`panel-switch-btn ${!isNationwide ? "active" : ""}`}
            onClick={() => {
              setMapScope("airport");
              setRecenterKey((prev) => prev + 1);
            }}
          >
            공항
          </button>
        </div>
          <div className="time-range">
            <button
              type="button"
              className={`range-btn echo-toggle ${showEcho ? "active" : ""}`}
            onClick={() => setShowEcho((v) => !v)}
            title={echoInfo ? `강수에코 (${echoInfo.echoCount} px)` : isNationwide ? "전국 강수에코 오버레이를 사용할 수 없습니다" : "강수에코를 사용할 수 없습니다"}
            disabled={!echoInfo}
            >
              강수에코
            </button>
            <button
              type="button"
              className={`range-btn satellite-toggle ${showSatellite ? "active" : ""}`}
              onClick={() => setShowSatellite((v) => !v)}
              title={displaySatInfo ? `안개영상 (${displaySatInfo.tm || ""})` : "안개영상을 사용할 수 없습니다"}
              disabled={!displaySatInfo}
            >
              안개
            </button>
          <button
            type="button"
            className={`range-btn ${showLightning ? "active" : ""}`}
            onClick={() => setShowLightning((v) => !v)}
          >
            낙뢰
          </button>
          {showLightning && (
            <button
              type="button"
              className={`range-btn lightning-blink-toggle ${blinkLightning ? "active" : ""}`}
              onClick={() => setBlinkLightning((v) => !v)}
            >
              깜빡임
            </button>
          )}
            <button
              type="button"
              className={`range-btn sigmet-toggle ${showSigmet ? "active" : ""}`}
              onClick={() => setShowSigmet((v) => !v)}
            >
              SIGMET
            </button>
            <button
              type="button"
              className={`range-btn airmet-toggle ${showAirmet ? "active" : ""}`}
              onClick={() => setShowAirmet((v) => !v)}
            >
              AIRMET
            </button>
            <button
              type="button"
              className={`range-btn sigwx-toggle ${showSigwxLow ? "active" : ""}`}
              onClick={() => setShowSigwxLow((value) => !value)}
            >
              SIGWX_LOW
            </button>
            <button
              type="button"
              className={`range-btn traffic-toggle ${showTraffic ? "active" : ""}`}
              onClick={() => setShowTraffic((v) => !v)}
            >
              TRAFFIC
            </button>
          </div>
      </div>

      {!isNationwide && !arp ? (
        <p className="sub">이 공항의 낙뢰 데이터를 사용할 수 없습니다.</p>
      ) : (
        <>
          <div className={`interactive-map-shell interactive-map-shell--${mapTheme} ${isNationwide ? "interactive-map-shell--korea" : "interactive-map-shell--airport"}`}>
            {(showLightning || advisoryBadgeItems.length > 0 || (showTraffic && adsbData)) && (
              <div className="interactive-map-legend" aria-label="활성 지도 배지">
                {showLightning && !isNationwide ? (
                  <>
                    <span className="zone-tag alert">8km {summary.byZone.alert}</span>
                    <span className="zone-tag danger">16km {summary.byZone.danger}</span>
                    <span className="zone-tag caution">32km {summary.byZone.caution}</span>
                  </>
                ) : null}
                {showTraffic && adsbData && (
                  <span className="zone-tag traffic">ACFT {visibleAircraft.length}</span>
                )}
                {advisoryBadgeItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`advisory-count-badge advisory-count-badge--${item.badgeClass || item.key} ${openAdvisoryPanel === item.key ? "active" : ""}`}
                    onClick={() => setOpenAdvisoryPanel((prev) => (prev === item.key ? null : item.key))}
                  >
                    {item.label} {item.count}
                  </button>
                ))}
              </div>
            )}
            {openAdvisoryPanel && advisoryPanelItems.length > 0 && (
              <div className={`advisory-detail-panel advisory-detail-panel--${openAdvisoryPanel}`} aria-label={`${openAdvisoryPanel} 상세 정보`}>
                <div className="advisory-detail-list">
                  {advisoryPanelItems.map((item) => {
                    const kind = openAdvisoryPanel;
                    const isVisible = !hiddenAdvisoryKeys[kind]?.includes(item.mapKey);
                    const isSigwx = kind === "sigwxLow";
                    const showAltitude = !isSigwx && advisoryShowsAltitude(item);
                    return (
                    <article key={`${openAdvisoryPanel}-${item.mapKey}`} className="advisory-detail-item">
                      <div className="advisory-detail-icon" aria-hidden="true">{isSigwx ? "WX" : advisoryPhenomenonIcon(item.phenomenon_code)}</div>
                      <div className="advisory-detail-main">
                        <div className="advisory-detail-title">{isSigwx ? (item.groupLabel || sigwxLabel(item)) : advisoryLabel(item)}</div>
                        <div className="advisory-detail-time">{isSigwx ? item.contour_name : advisoryValidLabel(item, tz)}</div>
                        {showAltitude ? <div className="advisory-detail-altitude">{advisoryAltitudeLabel(item)}</div> : null}
                      </div>
                      <label className="advisory-detail-toggle" title="표시 여부">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleAdvisoryVisibility(kind, item.mapKey)}
                          aria-label={`${isSigwx ? sigwxLabel(item) : advisoryLabel(item)} 표시 여부`}
                        />
                      </label>
                    </article>
                  );})}
                </div>
              </div>
            )}
            {(showEcho && echoInfo) || showLightning ? (
              <div className="map-right-legends">
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
                {showLightning && (
                  <div
                    className="lightning-time-legend"
                    aria-label="Lightning time legend"
                  >
                    <div className="lightning-time-legend-title">LIGHTNING</div>
                    <div className="lightning-time-legend-sub">10 MIN</div>
                    <div className="lightning-time-legend-current">{formatReferenceTimeLabel(lightningReferenceTimeMs)}</div>
                    <div className="lightning-time-legend-scale">
                      {lightningLegendEntries.map((entry) => (
                        <div key={`${entry.min}-${entry.max}`} className="lightning-time-legend-row">
                          <span className="lightning-time-legend-label">{entry.label}</span>
                          <span
                            className="lightning-time-legend-swatch"
                            style={{ backgroundColor: entry.color }}
                            aria-hidden="true"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
              <MapContainer
                key={`interactive-map-${mapTheme}-${mapScope}`}
                center={center}
                zoom={mapZoom}
                zoomSnap={0.1}
                zoomDelta={0.2}
                scrollWheelZoom={true}
                zoomControl={true}
                attributionControl={false}
                className={`interactive-map-container ${isNationwide ? "interactive-map-container--korea" : "interactive-map-container--airport"}`}
              >
              <MapRecenter
                center={center}
                zoom={mapZoom}
                bounds={mapBounds}
                boundsPadding={mapBoundsPadding}
                zoomOffset={mapZoomOffset}
                recenterKey={recenterKey}
              />
              <ZoomBoundaryController onBoundaryChange={handleBoundaryChange} />

            {!showEcho && !showSatellite && (
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

            {showSatellite && displaySatInfo && (
              <Pane name="satellite-pane" style={{ zIndex: 390 }}>
                <ImageOverlay
                  url={displaySatInfo.url}
                  bounds={displaySatInfo.bounds}
                  opacity={1}
                />
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

            {showSigwxLow && showVisibleSigwxFrontOverlay && sigwxFrontInfo && (
              <Pane name="sigwx-front-pane" style={{ zIndex: 405 }}>
                <ImageOverlay
                  url={sigwxFrontInfo.url}
                  bounds={sigwxFrontInfo.bounds}
                  opacity={1}
                />
              </Pane>
            )}

            {showSigwxLow && showVisibleSigwxCloudOverlay && sigwxCloudInfo && (
              <Pane name="sigwx-cloud-pane" style={{ zIndex: 406 }}>
                <ImageOverlay
                  url={sigwxCloudInfo.url}
                  bounds={sigwxCloudInfo.bounds}
                  opacity={1}
                />
              </Pane>
            )}

            {showEcho && (
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

            <Pane name="fir-boundary-pane" style={{ zIndex: 445 }}>
              {showFirDraft && (
                <GeoJSON
                  key="rkrr-fir-draft"
                  data={firDraftGeoData}
                  style={() => ({
                    fill: false,
                    color: mapTheme === "light" ? "#2563eb" : "#60a5fa",
                    weight: 1.5,
                    opacity: mapTheme === "light" ? 0.78 : 0.84
                  })}
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
                    opacity: 1,
                    fill: false,
                  }}
                />
              ))}
            </Pane>

            <Pane name="advisory-pane" style={{ zIndex: 520 }}>
              {showSigwxLow && visibleSigwxLowItems.map((item) => {
                const hoverKey = resolveSigwxHoverKey(item);
                const hovered = hoveredAdvisoryId === hoverKey;

                if (isSigwxArrowItem(item)) {
                  return (
                    <SigwxArrowAnnotation
                      key={`sigwx-arrow-${item.mapKey}`}
                      item={item}
                      hovered={hovered}
                      onHoverStart={() => setHoveredAdvisoryId(hoverKey)}
                      onHoverEnd={() => setHoveredAdvisoryId((prev) => (prev === hoverKey ? null : prev))}
                    />
                  );
                }

                if (!sigwxNeedsPath(item)) return null;
                const positions = item.smoothedLatLngs?.length ? item.smoothedLatLngs : item.lat_lngs;
                const pathProps = {
                  pathOptions: sigwxStyle(item, hovered),
                  eventHandlers: {
                    mouseover: () => setHoveredAdvisoryId(hoverKey),
                    mouseout: () => setHoveredAdvisoryId((prev) => (prev === hoverKey ? null : prev)),
                  },
                };

                if (item.is_close && item.lat_lngs.length >= 3) {
                  return (
                    <Polygon key={`sigwx-${item.mapKey}`} positions={positions} {...pathProps}>
                      <Tooltip sticky opacity={0.96} className="advisory-tooltip">
                        <div className="advisory-tooltip-body">
                          <strong>{sigwxPhenomenonLabel(item)}</strong>
                          {renderSigwxAltitude(item)}
                          <div className="advisory-tooltip-meta">{sigwxTypeLabel(item)}</div>
                        </div>
                      </Tooltip>
                    </Polygon>
                  );
                }

                return (
                  <Polyline key={`sigwx-${item.mapKey}`} positions={positions} {...pathProps}>
                    <Tooltip sticky opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{sigwxPhenomenonLabel(item)}</strong>
                        {renderSigwxAltitude(item)}
                        <div className="advisory-tooltip-meta">{sigwxTypeLabel(item)}</div>
                      </div>
                    </Tooltip>
                  </Polyline>
                );
              })}
              {showSigmet && visibleSigmetItems.map((item) => {
                const positions = geometryToLeafletPositions(item.geometry);
                if (!positions) return null;
                const hovered = hoveredAdvisoryId === item.mapKey;
                return (
                  <Polygon
                    key={`sigmet-${item.mapKey}`}
                    positions={positions}
                    pathOptions={advisoryStyle(item, "sigmet", hovered)}
                    eventHandlers={{
                      mouseover: () => setHoveredAdvisoryId(item.mapKey),
                      mouseout: () => setHoveredAdvisoryId((prev) => (prev === item.mapKey ? null : prev))
                    }}
                  >
                    <Tooltip sticky opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{advisoryLabel(item)}</strong>
                        <div>{advisoryValidLabel(item, tz)}</div>
                        <div>{advisoryAltitudeLabel(item)}</div>
                        <div>{item.sequence_number || "-"}</div>
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              })}
              {showAirmet && visibleAirmetItems.map((item) => {
                const positions = geometryToLeafletPositions(item.geometry);
                if (!positions) return null;
                const hovered = hoveredAdvisoryId === item.mapKey;
                return (
                  <Polygon
                    key={`airmet-${item.mapKey}`}
                    positions={positions}
                    pathOptions={advisoryStyle(item, "airmet", hovered)}
                    eventHandlers={{
                      mouseover: () => setHoveredAdvisoryId(item.mapKey),
                      mouseout: () => setHoveredAdvisoryId((prev) => (prev === item.mapKey ? null : prev))
                    }}
                  >
                    <Tooltip sticky opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{advisoryLabel(item)}</strong>
                        <div>{advisoryValidLabel(item, tz)}</div>
                        <div>{advisoryAltitudeLabel(item)}</div>
                        <div>{item.sequence_number || "-"}</div>
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              })}
            </Pane>

            <Pane name="advisory-icon-pane" style={{ zIndex: 530 }}>
              {showSigwxLow && visibleSigwxLowItems.map((item) => {
                if (!sigwxNeedsLabelMarker(item)) return null;
                const centerPoint = sigwxCenter(item);
                if (!centerPoint) return null;
                const hoverKey = resolveSigwxHoverKey(item);
                return (
                  <Marker
                    key={`sigwx-icon-${item.mapKey}`}
                    position={centerPoint}
                    icon={createSigwxBadgeIcon(item)}
                    eventHandlers={{
                      mouseover: () => setHoveredAdvisoryId(hoverKey),
                      mouseout: () => setHoveredAdvisoryId((prev) => (prev === hoverKey ? null : prev)),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{sigwxPhenomenonLabel(item)}</strong>
                        {renderSigwxAltitude(item)}
                        <div className="advisory-tooltip-meta">{sigwxTypeLabel(item)}</div>
                      </div>
                    </Tooltip>
                  </Marker>
                );
              })}
              {showSigwxLow && visibleSigwxLowItems.map((item) => {
                if (!shouldRenderSigwxTextLabel(item)) return null;
                const labelPoint = sigwxLabelPosition(item, selectedSigwxEntry?.source);
                if (!labelPoint) return null;
                const hoverKey = resolveSigwxHoverKey(item);
                return (
                  <Marker
                    key={`sigwx-text-${item.mapKey}`}
                    position={labelPoint}
                    icon={createSigwxTextLabelIcon(item)}
                    eventHandlers={{
                      mouseover: () => setHoveredAdvisoryId(hoverKey),
                      mouseout: () => setHoveredAdvisoryId((prev) => (prev === hoverKey ? null : prev)),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{sigwxPhenomenonLabel(item)}</strong>
                        {renderSigwxAltitude(item)}
                        <div className="advisory-tooltip-meta">{sigwxTypeLabel(item)}</div>
                      </div>
                    </Tooltip>
                  </Marker>
                );
              })}
              {showSigmet && visibleSigmetItems.map((item) => {
                const centerPoint = advisoryCenter(item);
                if (!centerPoint) return null;
                return (
                  <Marker
                    key={`sigmet-icon-${item.mapKey}`}
                    position={centerPoint}
                    icon={createAdvisoryIcon(item, "sigmet")}
                    eventHandlers={{
                      mouseover: () => setHoveredAdvisoryId(item.mapKey),
                      mouseout: () => setHoveredAdvisoryId((prev) => (prev === item.mapKey ? null : prev))
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{advisoryLabel(item)}</strong>
                        <div>{advisoryValidLabel(item, tz)}</div>
                        <div>{advisoryAltitudeLabel(item)}</div>
                        <div>{item.sequence_number || "-"}</div>
                      </div>
                    </Tooltip>
                  </Marker>
                );
              })}
              {showAirmet && visibleAirmetItems.map((item) => {
                const centerPoint = advisoryCenter(item);
                if (!centerPoint) return null;
                return (
                  <Marker
                    key={`airmet-icon-${item.mapKey}`}
                    position={centerPoint}
                    icon={createAdvisoryIcon(item, "airmet")}
                    eventHandlers={{
                      mouseover: () => setHoveredAdvisoryId(item.mapKey),
                      mouseout: () => setHoveredAdvisoryId((prev) => (prev === item.mapKey ? null : prev))
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.96} className="advisory-tooltip">
                      <div className="advisory-tooltip-body">
                        <strong>{advisoryLabel(item)}</strong>
                        <div>{advisoryValidLabel(item, tz)}</div>
                        <div>{advisoryAltitudeLabel(item)}</div>
                        <div>{item.sequence_number || "-"}</div>
                      </div>
                    </Tooltip>
                  </Marker>
                );
              })}
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
                const { color, opacity } = getStrikeColor(strike.time, lightningReferenceTimeMs);
                return (
                  <Marker
                    key={`${strike.time}-${strike.lon}-${strike.lat}-${idx}`}
                    position={[strike.lat, strike.lon]}
                    icon={createLightningIcon(color, opacity, blinkLightning)}
                  />
                );
              })}
            </Pane>

            <Pane name="traffic-pane" style={{ zIndex: 510 }}>
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

          <div className="radar-timeline">
              <div className="radar-controls">
                <div className="radar-speed-control">
                  <button
                    type="button"
                    className="radar-speed-step"
                    onClick={() => changePlaybackSpeed(-FRAME_MS_STEP)}
                    disabled={!canDecrementSpeed}
                    aria-label="재생시간 줄이기"
                    title="재생시간 줄이기"
                  >
                    -
                  </button>
                  <span className="radar-speed-chip">재생시간 {(playbackMs / 1000).toFixed(1)}초</span>
                  <button
                    type="button"
                    className="radar-speed-step"
                    onClick={() => changePlaybackSpeed(FRAME_MS_STEP)}
                    disabled={!canIncrementSpeed}
                    aria-label="재생시간 늘리기"
                    title="재생시간 늘리기"
                  >
                    +
                  </button>
                </div>
                {showSigwxLow && selectedSigwxEntry ? (
                  <div className="sigwx-history-control" aria-label="SIGWX history control">
                    <button
                      type="button"
                      className="radar-speed-step sigwx-history-step"
                      onClick={() => setSigwxHistoryIndex((prev) => Math.min(prev + 1, sigwxHistoryEntries.length - 1))}
                      disabled={sigwxHistoryIndex >= sigwxHistoryEntries.length - 1}
                      aria-label="이전 SIGWX 보기"
                      title="이전 SIGWX 보기"
                    >
                      ‹
                    </button>
                    <div className="sigwx-history-meta">
                      <span>{`발표 : ${sigwxIssueLabel(selectedSigwxEntry.tmfc, tz)}`}</span>
                      <span>{`유효 : ${sigwxValidLabel(selectedSigwxEntry.tmfc, tz)}`}</span>
                    </div>
                    <button
                      type="button"
                      className="radar-speed-step sigwx-history-step"
                      onClick={() => setSigwxHistoryIndex((prev) => Math.max(prev - 1, 0))}
                      disabled={sigwxHistoryIndex <= 0}
                      aria-label="다음 SIGWX 보기"
                      title="다음 SIGWX 보기"
                    >
                      ›
                    </button>
                  </div>
                ) : showLightning && (
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
                  disabled={activeFrames.length <= 1}
                  aria-label={isPlaying ? "재생 일시정지" : "재생"}
                  title={isPlaying ? "일시정지" : "재생"}
                >
                  {isPlaying ? "⏸" : "▶"}
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
                    disabled={activeFrames.length === 0}
                    style={loopActive ? {
                      "--loop-start-pct": `${loopStartPct}%`,
                      "--loop-end-pct": `${loopEndPct}%`,
                    } : undefined}
                    aria-label="타임라인"
                  />
                  {maxIndex > 1 && (
                    <div className="radar-loop-overlay" aria-hidden="true">
                      <div
                        className={`radar-loop-handle radar-loop-handle--start${loopActive ? " active" : ""}`}
                        style={{ left: `${loopStartPct}%` }}
                        onPointerDown={(e) => handleLoopPointerDown("start", e)}
                        title={`반복 시작: ${formatTmLabel(activeFrames[loopStart]?.tm)}`}
                      >
                        ▼
                      </div>
                      <div
                        className={`radar-loop-handle radar-loop-handle--end${loopActive ? " active" : ""}`}
                        style={{ left: `${loopEndPct}%` }}
                        onPointerDown={(e) => handleLoopPointerDown("end", e)}
                        title={`반복 종료: ${formatTmLabel(activeFrames[loopEnd]?.tm)}`}
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
                    {activeFrames.length > 0 ? formatTmLabel(activeFrames[frameIndex]?.tm || currentSatFrame?.tm) : ""}
                  </span>
                </div>
              </div>
            </div>
        </>
      )}
    </aside>
  );
}

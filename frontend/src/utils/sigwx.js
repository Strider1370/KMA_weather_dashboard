function parseDashArray(lineType) {
  switch (String(lineType || "")) {
    case "2":
      return "8 6";
    case "3":
      return "10 6";
    case "4":
      return "10 4 2 4";
    case "5":
      return "14 8";
    case "6":
      return "16 6";
    case "7":
      return "12 4 2 4 2 4";
    case "8":
      return "18 6";
    case "301":
    case "302":
    case "303":
    case "304":
    case "310":
      return "10 6";
    default:
      return null;
  }
}

function chaikinPass(points, isClosed) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const next = [];

  if (!isClosed) {
    next.push(points[0]);
  }

  const limit = isClosed ? points.length : points.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const current = points[i];
    const following = points[(i + 1) % points.length];
    if (!current || !following) continue;
    next.push([
      (0.75 * current[0]) + (0.25 * following[0]),
      (0.75 * current[1]) + (0.25 * following[1]),
    ]);
    next.push([
      (0.25 * current[0]) + (0.75 * following[0]),
      (0.25 * current[1]) + (0.75 * following[1]),
    ]);
  }

  if (!isClosed) {
    next.push(points[points.length - 1]);
  } else if (next.length) {
    next.push(next[0]);
  }

  return next;
}

export function smoothSigwxLatLngs(latLngs, tension = 0, isClosed = false) {
  if (!Array.isArray(latLngs) || latLngs.length < 3 || tension <= 0) {
    return latLngs || [];
  }

  const iterations = Math.max(1, Math.min(3, Math.round(1 + (2 * Math.max(0, Math.min(1, tension))))));
  let current = isClosed ? [...latLngs, latLngs[0]] : [...latLngs];
  for (let i = 0; i < iterations; i += 1) {
    current = chaikinPass(current, isClosed);
  }
  return current;
}

function normalizeSigwxText(value) {
  return String(value || "")
    .replace(/&#10;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFlightLevelLabel(value) {
  const normalized = normalizeSigwxText(value);
  return normalized;
}

function sigwxPhenomenonName(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  const itemName = String(item?.item_name || item?.text_label || "").toLowerCase();
  const iconTokens = Array.isArray(item?.icon_tokens) ? item.icon_tokens.map((token) => String(token).toLowerCase()) : [];

  if (contour === "freezing_level") return "FZ LEVEL";
  if (contour === "sfc_vis") return "SFC_VIS";
  if (contour === "icing_area" || itemName.includes("ice") || iconTokens.some((token) => token.includes("ice"))) return "ICING";
  if (contour === "ktg" || itemName.includes("turb") || iconTokens.some((token) => token.includes("turb"))) return "TURB";
  if (contour === "cld") return "CLOUD";

  return normalizeSigwxText(item?.text_label || item?.item_name || item?.contour_name || "SIGWX").toUpperCase();
}

function sigwxSupportItem(item) {
  if (!item) return null;
  const childItems = Array.isArray(item.childItems) ? item.childItems : [];
  return childItems.find((child) => child.label || child.text_label || child.icon_name) || item;
}

function sigwxRawAltitudeLabel(item) {
  const source = sigwxSupportItem(item);
  const jetLabel = Array.isArray(source?.fpv_points)
    ? source.fpv_points.find((point) => point?.lbl)?.lbl
    : "";
  return normalizeSigwxText(source?.label || source?.text_label || jetLabel);
}

export function sigwxIntensityLabel(item) {
  const source = sigwxSupportItem(item);
  const itemName = String(source?.item_name || "").toLowerCase();
  const iconName = String(source?.icon_name || "").toLowerCase();
  const rawLabel = sigwxRawAltitudeLabel(source).toLowerCase();

  if (itemName.includes("severe") || iconName.includes("severe") || rawLabel.includes("sev")) return "SEV";
  if (itemName.includes("moderate") || iconName.includes("moderate") || itemName.includes("mod_") || iconName.includes("mod_") || rawLabel.includes("mod")) return "MOD";
  if (rawLabel.includes("isol")) return "ISOL";

  return "";
}

export function sigwxPhenomenonLabel(item) {
  const source = sigwxSupportItem(item);
  const base = sigwxPhenomenonName(source);
  const intensity = sigwxIntensityLabel(source);
  if (!intensity || base === "FZ LEVEL") return base;
  if (base.startsWith(intensity)) return base;
  return `${intensity} ${base}`;
}

export function sigwxAltitudeLabel(item) {
  const contour = String(item?.contour_name || sigwxSupportItem(item)?.contour_name || "").toLowerCase();
  const rawLabel = sigwxRawAltitudeLabel(item);
  if (!rawLabel) return "-";
  if (contour === "freezing_level") return formatFlightLevelLabel(rawLabel);
  return rawLabel;
}

export function sigwxAltitudeParts(item) {
  const contour = String(item?.contour_name || sigwxSupportItem(item)?.contour_name || "").toLowerCase();
  const rawLabel = sigwxRawAltitudeLabel(item);
  if (!rawLabel || contour === "freezing_level") return null;

  const parts = rawLabel.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return null;

  return {
    upper: parts[0],
    lower: parts[1],
  };
}

export function sigwxLabel(item) {
  const iconTokens = Array.isArray(item?.icon_tokens) ? item.icon_tokens : [];
  const jetLabel = Array.isArray(item?.fpv_points)
    ? item.fpv_points.find((point) => point?.lbl)?.lbl
    : "";
  const rawLabel = normalizeSigwxText(item?.label || item?.text_label || jetLabel);
  const phenomenonName = sigwxPhenomenonLabel(item);

  if (String(item?.contour_name || "").toLowerCase() === "freezing_level") {
    return formatFlightLevelLabel(rawLabel);
  }

  if (phenomenonName && phenomenonName !== "SIGWX") {
    return phenomenonName;
  }

  return rawLabel
    || normalizeSigwxText(item?.item_name)
    || normalizeSigwxText(iconTokens.join(" / "))
    || normalizeSigwxText(item?.contour_name)
    || "SIGWX";
}

export function sigwxTypeLabel(item) {
  const type = Number(item?.item_type);
  const contour = normalizeSigwxText(item?.contour_name || "-");
  const itemName = normalizeSigwxText(item?.item_name || "-");
  return `type ${Number.isFinite(type) ? type : "-"} | contour: ${contour} | item: ${itemName}`;
}

export function sigwxStyle(item, hovered) {
  const weight = hovered ? (item?.line_width || 2) + 1 : (item?.line_width || 2);
  return {
    color: item?.color_line || "#ffffff",
    weight,
    opacity: hovered ? 1 : 0.9,
    fill: Boolean(item?.is_fill || item?.is_close),
    fillColor: item?.color_back || "#ffffff",
    fillOpacity: item?.is_fill ? 0.12 : 0.02,
    dashArray: parseDashArray(item?.line_type),
  };
}

export function sigwxCenter(item) {
  const latLngs = item?.smoothedLatLngs?.length ? item.smoothedLatLngs : item?.lat_lngs;
  if (!Array.isArray(latLngs) || latLngs.length === 0) return null;
  const lat = latLngs.reduce((sum, [value]) => sum + value, 0) / latLngs.length;
  const lon = latLngs.reduce((sum, [, value]) => sum + value, 0) / latLngs.length;
  return [lat, lon];
}

export function sigwxNeedsLabelMarker(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  const itemName = String(item?.item_name || "").toLowerCase();
  if (contour === "freezing_level") return true;
  if (contour === "sfc_wind" && itemName === "wind_strong") return true;
  return [7, 8, 10, 11, 12].includes(Number(item?.item_type));
}

export function isPrimarySigwxItem(item) {
  return Number(item?.item_type) === 4;
}

export function isSigwxArrowItem(item) {
  const type = Number(item?.item_type);
  const contour = String(item?.contour_name || "").toLowerCase();
  const label = String(item?.label || "").trim().toLowerCase();
  const hasLine = Array.isArray(item?.lat_lngs) && item.lat_lngs.length >= 2;
  if (!hasLine) return false;
  if (contour === "freezing_level") return false;

  if (type === 9) {
    return contour === "cld" || contour === "font_line" || contour === "";
  }

  if (type === 10) {
    return contour === "" || label.includes("km/h");
  }

  return false;
}

export function sigwxNeedsPath(item) {
  const contour = String(item?.contour_name || "").toLowerCase();
  const itemName = String(item?.item_name || "").toLowerCase();
  if (isSigwxArrowItem(item)) return false;
  if (contour === "font_line") return false;
  if (contour === "sfc_wind" && itemName === "wind_strong") return false;
  return ![7, 10, 12].includes(Number(item?.item_type));
}

function pointDistanceKm(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const latFactor = 111;
  const meanLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const lonFactor = Math.cos(meanLat) * 111;
  const dLat = (a[0] - b[0]) * latFactor;
  const dLon = (a[1] - b[1]) * lonFactor;
  return Math.sqrt((dLat * dLat) + (dLon * dLon));
}

function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  const [lat, lon] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersects = ((latI > lat) !== (latJ > lat))
      && (lon < ((lonJ - lonI) * (lat - latI)) / ((latJ - latI) || Number.EPSILON) + lonI);
    if (intersects) inside = !inside;
  }

  return inside;
}

export function buildSigwxGroups(items) {
  const primaryItems = items.filter((item) => isPrimarySigwxItem(item));
  const groups = primaryItems.map((item) => ({
    ...item,
    childItems: [],
  }));

  const groupsByContour = new Map();
  for (const group of groups) {
    const key = `${group.contour_name || ""}::${group.item_name || ""}`;
    const entry = groupsByContour.get(key) || [];
    entry.push(group);
    groupsByContour.set(key, entry);
  }

  for (const item of items) {
    if (isPrimarySigwxItem(item)) continue;
    const key = `${item.contour_name || ""}::${item.item_name || ""}`;
    const candidates = groupsByContour.get(key) || groups.filter((group) => group.contour_name === item.contour_name);
    if (!candidates.length) continue;
    const itemCenter = sigwxCenter(item);
    const containingCandidates = candidates.filter((candidate) => (
      candidate.is_close && pointInPolygon(itemCenter, candidate.smoothedLatLngs?.length ? candidate.smoothedLatLngs : candidate.lat_lngs)
    ));
    const matchedCandidates = containingCandidates.length ? containingCandidates : candidates;

    let bestGroup = matchedCandidates[0];
    let bestDistance = pointDistanceKm(itemCenter, sigwxCenter(bestGroup));
    for (let i = 1; i < matchedCandidates.length; i += 1) {
      const candidate = matchedCandidates[i];
      const distance = pointDistanceKm(itemCenter, sigwxCenter(candidate));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestGroup = candidate;
      }
    }
    bestGroup.childItems.push({
      ...item,
      parentMapKey: bestGroup.mapKey,
    });
  }

  return groups.map((group) => ({
    ...group,
    groupLabel: sigwxLabel(group.childItems.find((item) => item.label || item.text_label || item.icon_name) || group),
  }));
}

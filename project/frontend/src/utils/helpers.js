export function safe(value, fallback = "-") {
  return value == null || value === "" ? fallback : value;
}

export function formatUtc(value) {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", " UTC");
}

export function getSeverityLevel({ visibility, wind, gust }) {
  if (visibility != null && visibility < 800) return "danger";
  if (gust != null && gust >= 35) return "danger";
  if (wind != null && wind >= 25) return "danger";

  if (visibility != null && visibility < 1500) return "warn";
  if (gust != null && gust >= 25) return "warn";
  if (wind != null && wind >= 15) return "warn";
  return "ok";
}

export function severityLabel(level) {
  if (level === "danger") return "High Risk";
  if (level === "warn") return "Advisory";
  return "Normal";
}

export function toCanvasXY(point, arp, size, rangeKm) {
  const center = size / 2;
  const scale = center / rangeKm;
  const dLonKm = (point.lon - arp.lon) * 111.32 * Math.cos((arp.lat * Math.PI) / 180);
  const dLatKm = (point.lat - arp.lat) * 111.32;
  return { x: center + dLonKm * scale, y: center - dLatKm * scale };
}

export function warningMeta(typeCode, warningTypes) {
  const raw = String(typeCode || "").trim();
  const stripped = raw.replace(/^0+/, "");
  const candidates = [raw];
  if (raw === "0") candidates.push("00");
  if (stripped && stripped !== raw) candidates.push(stripped);

  for (const code of candidates) {
    if (warningTypes[code]) return warningTypes[code];
  }
  return null;
}

import { getCurrentRouteContext } from "./route-mode";

function isTestPathActive() {
  return getCurrentRouteContext().isTestPage;
}

function withNoCache(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ts=${Date.now()}`;
}

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchJsonOptional(url) {
  try {
    return await fetchJson(url);
  } catch (error) {
    return null;
  }
}

async function fetchPreferTest(testUrl, liveUrl, { optional = false } = {}) {
  const fetcher = optional ? fetchJsonOptional : fetchJson;

  if (isTestPathActive() && testUrl) {
    const testData = await fetchJsonOptional(withNoCache(testUrl));
    if (testData != null) {
      return testData;
    }
  }

  return fetcher(liveUrl);
}

export async function loadAllData() {
  const [metar, taf, warning, airports, warningTypes, lightning, echoMeta, adsb, sigmet, airmet, sigwxLow, sigwxLowHistory, amos, satMeta, groundForecast] = await Promise.all([
    fetchPreferTest("/test/metar/latest.json", "/api/metar"),
    fetchPreferTest("/test/taf/latest.json", "/api/taf"),
    fetchPreferTest("/test/warning/latest.json", "/api/warning", { optional: true }),
    fetchJson("/api/airports"),
    fetchJson("/api/warning-types"),
    fetchPreferTest("/test/lightning/latest.json", "/api/lightning", { optional: true }),
    fetchPreferTest("/test/radar/echo_meta.json", "/data/radar/echo_meta.json", { optional: true }),
    fetchPreferTest("/test/adsb/latest.json", "/api/adsb", { optional: true }),
    fetchPreferTest("/test/sigmet/latest.json", "/api/sigmet", { optional: true }),
    fetchPreferTest("/test/airmet/latest.json", "/api/airmet", { optional: true }),
    fetchPreferTest("/test/sigwx-low/latest.json", "/api/sigwx-low", { optional: true }),
    fetchPreferTest("/test/sigwx-low/history.json", "/api/sigwx-low-history", { optional: true }),
    fetchPreferTest("/test/amos/latest.json", "/api/amos", { optional: true }),
    fetchPreferTest("/test/satellite/sat_meta.json", "/data/satellite/sat_meta.json", { optional: true }),
    fetchJsonOptional("/api/ground-forecast"),
  ]);
  return { metar, taf, warning, airports, warningTypes, lightning, echoMeta, adsb, sigmet, airmet, sigwxLow, sigwxLowHistory, amos, satMeta, groundForecast };
}

export async function loadAlertDefaults() {
  return fetchJson("/api/alert-defaults");
}

export async function loadStaticData() {
  const [airports, warningTypes, alertDefaults] = await Promise.all([
    fetchJson("/api/airports"),
    fetchJson("/api/warning-types"),
    fetchJson("/api/alert-defaults"),
  ]);
  return { airports, warningTypes, alertDefaults };
}

export async function fetchSnapshotMeta() {
  if (isTestPathActive()) {
    const data = await loadAllData();
    return {
      metar: { hash: data.metar?.content_hash || null },
      taf: { hash: data.taf?.content_hash || null },
      warning: { hash: data.warning?.content_hash || null },
      sigmet: { hash: data.sigmet?.content_hash || null },
      airmet: { hash: data.airmet?.content_hash || null },
      sigwx_low: { hash: data.sigwxLow?.content_hash || null },
      amos: { hash: data.amos?.content_hash || null },
      lightning: { hash: data.lightning?.content_hash || null },
      adsb: { hash: data.adsb?.content_hash || null },
      ground_forecast: { hash: data.groundForecast?.content_hash || null },
      echo: data.echoMeta?.tm != null ? { tm: data.echoMeta.tm } : null,
      satellite: data.satMeta?.tm != null ? { tm: data.satMeta.tm } : null,
    };
  }

  return fetchJson("/api/snapshot-meta");
}

export async function loadChangedData(changes) {
  const fetches = [];
  const keys = [];

  if (changes.metar) { fetches.push(fetchPreferTest("/test/metar/latest.json", "/api/metar")); keys.push("metar"); }
  if (changes.taf) { fetches.push(fetchPreferTest("/test/taf/latest.json", "/api/taf")); keys.push("taf"); }
  if (changes.warning) { fetches.push(fetchPreferTest("/test/warning/latest.json", "/api/warning", { optional: true })); keys.push("warning"); }
  if (changes.sigmet) { fetches.push(fetchPreferTest("/test/sigmet/latest.json", "/api/sigmet", { optional: true })); keys.push("sigmet"); }
  if (changes.airmet) { fetches.push(fetchPreferTest("/test/airmet/latest.json", "/api/airmet", { optional: true })); keys.push("airmet"); }
  if (changes.sigwxLow) {
    fetches.push(fetchPreferTest("/test/sigwx-low/latest.json", "/api/sigwx-low", { optional: true }));
    keys.push("sigwxLow");
    fetches.push(fetchPreferTest("/test/sigwx-low/history.json", "/api/sigwx-low-history", { optional: true }));
    keys.push("sigwxLowHistory");
  }
  if (changes.amos) { fetches.push(fetchPreferTest("/test/amos/latest.json", "/api/amos", { optional: true })); keys.push("amos"); }
  if (changes.lightning) { fetches.push(fetchPreferTest("/test/lightning/latest.json", "/api/lightning", { optional: true })); keys.push("lightning"); }
  if (changes.adsb) { fetches.push(fetchPreferTest("/test/adsb/latest.json", "/api/adsb", { optional: true })); keys.push("adsb"); }
  if (changes.groundForecast) { fetches.push(fetchJsonOptional("/api/ground-forecast")); keys.push("groundForecast"); }
  if (changes.echoMeta) { fetches.push(fetchPreferTest("/test/radar/echo_meta.json", "/data/radar/echo_meta.json", { optional: true })); keys.push("echoMeta"); }
  if (changes.satMeta) { fetches.push(fetchPreferTest("/test/satellite/sat_meta.json", "/data/satellite/sat_meta.json", { optional: true })); keys.push("satMeta"); }

  const results = await Promise.all(fetches);
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = results[i];
  }
  return out;
}

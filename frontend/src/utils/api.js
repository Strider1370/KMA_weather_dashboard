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

export async function loadAllData() {
  const [metar, taf, warning, airports, warningTypes, lightning, echoMeta, adsb] = await Promise.all([
    fetchJson("/api/metar"),
    fetchJson("/api/taf"),
    fetchJson("/api/warning"),
    fetchJson("/api/airports"),
    fetchJson("/api/warning-types"),
    fetchJsonOptional("/api/lightning"),
    fetchJsonOptional("/data/radar/echo_meta.json"),
    fetchJsonOptional("/api/adsb"),
  ]);
  return { metar, taf, warning, airports, warningTypes, lightning, echoMeta, adsb };
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
  return fetchJson("/api/snapshot-meta");
}

export async function loadChangedData(changes) {
  const fetches = [];
  const keys = [];

  if (changes.metar) { fetches.push(fetchJson("/api/metar")); keys.push("metar"); }
  if (changes.taf) { fetches.push(fetchJson("/api/taf")); keys.push("taf"); }
  if (changes.warning) { fetches.push(fetchJson("/api/warning")); keys.push("warning"); }
  if (changes.lightning) { fetches.push(fetchJsonOptional("/api/lightning")); keys.push("lightning"); }
  if (changes.adsb) { fetches.push(fetchJsonOptional("/api/adsb")); keys.push("adsb"); }
  if (changes.echoMeta) { fetches.push(fetchJsonOptional("/data/radar/echo_meta.json")); keys.push("echoMeta"); }

  const results = await Promise.all(fetches);
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = results[i];
  }
  return out;
}

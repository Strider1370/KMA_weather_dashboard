export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

export async function loadAllData() {
  const [metar, taf, warning, airports, warningTypes, status] = await Promise.all([
    fetchJson("/api/metar"),
    fetchJson("/api/taf"),
    fetchJson("/api/warning"),
    fetchJson("/api/airports"),
    fetchJson("/api/warning-types"),
    fetchJson("/api/status"),
  ]);
  return { metar, taf, warning, airports, warningTypes, status };
}

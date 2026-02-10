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
  const [metar, taf, warning, airports, warningTypes, status, lightning] = await Promise.all([
    fetchJson("/api/metar"),
    fetchJson("/api/taf"),
    fetchJson("/api/warning"),
    fetchJson("/api/airports"),
    fetchJson("/api/warning-types"),
    fetchJson("/api/status"),
    fetchJsonOptional("/api/lightning"),
  ]);
  return { metar, taf, warning, airports, warningTypes, status, lightning };
}

export async function loadAlertDefaults() {
  return fetchJson("/api/alert-defaults");
}

export async function triggerRefresh() {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) {
    throw new Error(`/api/refresh -> HTTP ${response.status}`);
  }
  return response.json();
}

const state = {
  metar: null,
  taf: null,
  warning: null,
  airports: [],
  warningTypes: {}
};

const airportSelect = document.getElementById("airport-select");
const refreshBtn = document.getElementById("refresh-btn");

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function safe(value, fallback = "-") {
  return value == null || value === "" ? fallback : value;
}

function formatUtc(value) {
  if (!value) {
    return "-";
  }
  return value.replace("T", " ").replace("Z", " UTC");
}

function warningMeta(typeCode) {
  const raw = String(typeCode || "").trim();
  const stripped = raw.replace(/^0+/, "");
  const candidates = [raw];
  if (raw === "0") candidates.push("00");
  if (stripped && stripped !== raw) candidates.push(stripped);

  for (const code of candidates) {
    if (state.warningTypes[code]) return state.warningTypes[code];
  }
  return null;
}

function getSeverityLevel({ visibility, wind, gust }) {
  if (visibility != null && visibility < 800) return "danger";
  if (gust != null && gust >= 35) return "danger";
  if (wind != null && wind >= 25) return "danger";

  if (visibility != null && visibility < 1500) return "warn";
  if (gust != null && gust >= 25) return "warn";
  if (wind != null && wind >= 15) return "warn";
  return "ok";
}

function severityLabel(level) {
  if (level === "danger") return "High Risk";
  if (level === "warn") return "Advisory";
  return "Normal";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

function fillAirportSelect() {
  const metarAirports = Object.keys(state.metar?.airports || {});
  const fallbacks = state.airports.map((a) => a.icao);
  const list = metarAirports.length > 0 ? metarAirports : fallbacks;

  airportSelect.innerHTML = "";
  for (const icao of list) {
    const option = document.createElement("option");
    option.value = icao;
    option.textContent = icao;
    airportSelect.appendChild(option);
  }
}

function renderSummary() {
  setText("metar-count", Object.keys(state.metar?.airports || {}).length);
  setText("taf-count", Object.keys(state.taf?.airports || {}).length);
  setText("warning-count", Object.keys(state.warning?.airports || {}).length);
  setText("warning-total", safe(state.warning?.total_count, 0));

  const updated = [state.metar?.fetched_at, state.taf?.fetched_at, state.warning?.fetched_at]
    .filter(Boolean)
    .sort()
    .pop();

  setText("last-updated", updated ? `Last Updated: ${formatUtc(updated)}` : "Last Updated: -");
}

function renderMetar(icao) {
  const target = state.metar?.airports?.[icao];
  const panel = document.getElementById("metar-card");
  if (!target) {
    panel.className = "mono";
    panel.textContent = "No METAR data for selected airport.";
    return;
  }

  const wind = target.observation?.wind?.speed;
  const gust = target.observation?.wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const level = getSeverityLevel({ visibility, wind, gust });
  const chips = [
    `Status: ${severityLabel(level)}`,
    `Wind: ${safe(target.observation?.display?.wind)}`,
    `Visibility: ${safe(target.observation?.display?.visibility)}`,
    `Weather: ${safe(target.observation?.display?.weather)}`,
    `Clouds: ${safe(target.observation?.display?.clouds)}`,
    `Temp: ${safe(target.observation?.display?.temperature)}`,
    `QNH: ${safe(target.observation?.display?.qnh)}`
  ];

  panel.className = `mono level-${level}`;
  panel.textContent = chips.join("\n");
}

function renderWarnings(icao) {
  const root = document.getElementById("warning-list");
  root.innerHTML = "";

  const block = state.warning?.airports?.[icao];
  const list = block?.warnings || [];

  if (list.length === 0) {
    root.innerHTML = '<div class="warning-item"><strong>No active warnings</strong><span>Airport has no current warning.</span></div>';
    return;
  }

  for (const item of list) {
    const meta = warningMeta(item.wrng_type) || {};
    const color = meta.color || "#d4603a";
    const title = item.wrng_type_key === "UNKNOWN" && meta.key ? meta.key : item.wrng_type_key;
    const name = item.wrng_type_name === "Unknown Warning" && meta.name ? meta.name : item.wrng_type_name;

    const el = document.createElement("article");
    el.className = "warning-item";
    el.style.borderLeftColor = color;
    el.style.background = `${color}18`;
    el.innerHTML = `
      <strong>${safe(title)}</strong>
      <span>${safe(name)}</span>
      <span>${formatUtc(item.valid_start)} -> ${formatUtc(item.valid_end)}</span>
    `;
    root.appendChild(el);
  }
}

function renderTaf(icao) {
  const tbody = document.getElementById("taf-body");
  tbody.innerHTML = "";

  const target = state.taf?.airports?.[icao];
  const timeline = target?.timeline || [];

  if (timeline.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5">No TAF timeline data for selected airport.</td>';
    tbody.appendChild(row);
    return;
  }

  for (const slot of timeline) {
    const level = getSeverityLevel({
      visibility: slot.visibility?.value,
      wind: slot.wind?.speed,
      gust: slot.wind?.gust
    });

    const row = document.createElement("tr");
    row.className = `row-${level}`;
    row.innerHTML = `
      <td>${formatUtc(slot.time)}</td>
      <td>${safe(slot.display?.wind)}</td>
      <td>${safe(slot.display?.visibility)}</td>
      <td>${safe(slot.display?.weather)}</td>
      <td>${safe(slot.display?.clouds)}</td>
    `;
    tbody.appendChild(row);
  }
}

function renderAirport(icao) {
  renderMetar(icao);
  renderWarnings(icao);
  renderTaf(icao);
}

async function loadAll() {
  try {
    const [metar, taf, warning, airports, warningTypes] = await Promise.all([
      fetchJson("/api/metar"),
      fetchJson("/api/taf"),
      fetchJson("/api/warning"),
      fetchJson("/api/airports"),
      fetchJson("/api/warning-types")
    ]);

    state.metar = metar;
    state.taf = taf;
    state.warning = warning;
    state.airports = airports;
    state.warningTypes = warningTypes || {};

    fillAirportSelect();
    renderSummary();

    const selected = airportSelect.value || Object.keys(metar.airports || {})[0];
    if (selected) {
      airportSelect.value = selected;
      renderAirport(selected);
    }
  } catch (error) {
    setText("last-updated", `Load failed: ${error.message}`);
  }
}

airportSelect.addEventListener("change", (event) => renderAirport(event.target.value));
refreshBtn.addEventListener("click", () => loadAll());

loadAll();

const apiClient = require("../api-client");
const store = require("../store");
const sigwxLowParser = require("../parsers/sigwx-low-parser");

function formatTmfc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${y}${m}${d}${hh}`;
}

function resolveLatestSigwxLowTmfc(now = new Date()) {
  const cycles = [5, 11, 17, 23];
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const candidateHour = [...cycles].reverse().find((hour) => currentHour >= hour);
  const cycleHour = candidateHour != null && currentHour === candidateHour && currentMinute < 5
    ? [...cycles].reverse().find((hour) => hour < candidateHour)
    : candidateHour;

  if (cycleHour != null) {
    const date = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      cycleHour,
      0,
      0,
      0
    ));
    return formatTmfc(date);
  }

  const previousDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
    23,
    0,
    0,
    0
  ));
  return formatTmfc(previousDay);
}

function resolveSigwxLowTmfcCandidates(now = new Date()) {
  const cycles = [5, 11, 17, 23];
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const prefetchWindowMinutes = 60;

  const previousCycleHour = [...cycles].reverse().find((hour) => currentHour >= hour);
  const nextCycleHour = cycles.find((hour) => hour > currentHour);

  const candidates = [];

  if (nextCycleHour != null) {
    const minutesUntilNextCycle = ((nextCycleHour - currentHour) * 60) - currentMinute;
    if (minutesUntilNextCycle >= 0 && minutesUntilNextCycle <= prefetchWindowMinutes) {
      candidates.push(new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        nextCycleHour,
        0,
        0,
        0
      )));
    }
  }

  if (previousCycleHour != null) {
    candidates.push(new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      previousCycleHour,
      0,
      0,
      0
    )));
  } else {
    candidates.push(new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1,
      23,
      0,
      0,
      0
    )));
  }

  return [...new Set(candidates.map((date) => formatTmfc(date)))];
}

async function fetchLatestSigwxLowXml(now = new Date()) {
  const candidates = resolveSigwxLowTmfcCandidates(now);
  let lastError = null;

  for (const tmfc of candidates) {
    try {
      const xml = await apiClient.fetchSigwxLow(tmfc, { maxRetries: 1 });
      return { tmfc, xml };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to fetch SIGWX LOW");
}

async function process() {
  const { tmfc, xml } = await fetchLatestSigwxLowXml();
  const parsed = sigwxLowParser.parse(xml);
  const result = {
    type: "sigwx_low",
    fetched_at: new Date().toISOString(),
    tmfc,
    source: {
      mode: parsed.mode,
      map_range_mode: parsed.map_range_mode,
      amd_use: parsed.amd_use,
      amd_hour: parsed.amd_hour,
      amd_min: parsed.amd_min,
      amd_tar_low: parsed.amd_tar_low,
      fpv_safe_bound_width: parsed.fpv_safe_bound_width,
      fpv_safe_bound_height: parsed.fpv_safe_bound_height,
    },
    items: parsed.items,
  };

  const saveResult = store.save("sigwx_low", result);
  return {
    type: "sigwx_low",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: parsed.items.length,
    tmfc,
  };
}

module.exports = {
  fetchLatestSigwxLowXml,
  process,
  resolveSigwxLowTmfcCandidates,
  resolveLatestSigwxLowTmfc,
};

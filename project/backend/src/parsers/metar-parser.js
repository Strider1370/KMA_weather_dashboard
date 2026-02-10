const { XMLParser } = require("fast-xml-parser");
const {
  toArray,
  text,
  number,
  lastToken,
  parseCloudLayer,
  parseWeatherCode,
  parseWind,
  resolveWeatherIconKey,
  pickPrimaryWeatherIcon,
  toMetarTempToken
} = require("./parse-utils");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  isArray: (name) => ["iwxxm:presentWeather", "iwxxm:weather", "iwxxm:layer", "item"].includes(name)
});

function decodeXmlEntities(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value
    .replace(/&#xD;/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseInnerMetar(xml) {
  const decoded = decodeXmlEntities(xml);
  const parsed = parser.parse(decoded);
  return parsed["iwxxm:METAR"] || parsed;
}

function getOuterItem(xmlString) {
  const outer = parser.parse(xmlString);
  const items = toArray(outer?.response?.body?.items?.item || outer?.body?.items?.item || outer?.items?.item);
  return items[0] || null;
}

function parseWindShear(obs) {
  const ws = obs?.["iwxxm:windShear"]?.["iwxxm:AerodromeWindShear"] || obs?.["iwxxm:AerodromeWindShear"];
  if (!ws) {
    return null;
  }

  const allRunways = String(ws?.["@_allRunways"] || "false").toLowerCase() === "true";
  if (allRunways) {
    return { all_runways: true, runways: null };
  }

  const runways = toArray(ws?.["iwxxm:runway"]).map((r) => text(r)).filter(Boolean);
  return {
    all_runways: false,
    runways: runways.length > 0 ? runways : null
  };
}

function buildDisplay(observation, flags) {
  return {
    wind: observation.wind.raw,
    visibility: String(observation.visibility.value ?? "//"),
    weather: observation.weather.map((w) => w.raw).join(" "),
    clouds: (flags.cavok || flags.nsc) ? "NSC" : observation.clouds.map((c) => c.raw).join(" "),
    temperature:
      observation.temperature.air != null && observation.temperature.dewpoint != null
        ? `${toMetarTempToken(observation.temperature.air)}/${toMetarTempToken(observation.temperature.dewpoint)}`
        : null,
    qnh: observation.qnh.value != null ? `Q${observation.qnh.value}` : null,
    weather_icon: flags.cavok ? "CAVOK" : pickPrimaryWeatherIcon(observation.weather),
    weather_intensity: observation.weather[0]?.intensity || null
  };
}

function parse(xmlString) {
  const item = getOuterItem(xmlString);
  if (!item) {
    return null;
  }

  let metar = {};
  const metarNode = item.metarMsg || item.metar;
  if (typeof metarNode === "string") {
    metar = parseInnerMetar(metarNode);
  } else if (metarNode && typeof metarNode === "object") {
    metar = metarNode["iwxxm:METAR"] || metarNode;
  }

  const issueTime =
    text(metar["iwxxm:issueTime"]?.["gml:TimeInstant"]?.["gml:timePosition"]) ||
    text(metar["iwxxm:issueTime"]?.["gml:timePosition"]);

  const observationTime =
    text(metar["iwxxm:observationTime"]?.["gml:TimeInstant"]?.["gml:timePosition"]) ||
    text(metar["iwxxm:observationTime"]?.["gml:timePosition"]);

  const obs = metar["iwxxm:observation"]?.["iwxxm:MeteorologicalAerodromeObservation"] || {};

  const cavok =
    String(metar["@_cloudAndVisibilityOK"] || obs["@_cloudAndVisibilityOK"] || "false").toLowerCase() === "true";

  const windNode = obs["iwxxm:surfaceWind"]?.["iwxxm:AerodromeSurfaceWind"] || {};
  const wind = parseWind(windNode);

  const visibilityNode =
    obs["iwxxm:visibility"]?.["iwxxm:AerodromeHorizontalVisibility"]?.["iwxxm:prevailingVisibility"] ||
    obs["iwxxm:visibility"]?.["iwxxm:prevailingVisibility"] ||
    obs["iwxxm:visibility"];

  const visibility = {
    value: cavok ? 9999 : number(visibilityNode),
    cavok
  };

  let weather = [];
  if (!cavok) {
    const weatherNodes = toArray(obs["iwxxm:presentWeather"]);
    weather = weatherNodes
      .map((node) => {
        const href = node?.["@_xlink:href"];
        const nilReason = String(node?.["@_nilReason"] || "").toLowerCase();
        if (nilReason.includes("nothingofoperationalsignificance")) {
          return null;
        }
        if (href) {
          return parseWeatherCode(lastToken(href));
        }
        const raw = text(node);
        return raw ? parseWeatherCode(lastToken(raw)) : null;
      })
      .filter(Boolean)
      .map((w) => ({ ...w, icon_key: resolveWeatherIconKey(w) }));
  }

  const cloudNode = obs["iwxxm:cloud"];
  const cloudNilReason = String(cloudNode?.["@_nilReason"] || "").toLowerCase();
  const nscFlag = cloudNilReason.includes("nothingofoperationalsignificance");

  let clouds = [];
  if (!cavok && !nscFlag) {
    const layerNodes = toArray(cloudNode?.["iwxxm:AerodromeCloud"]?.["iwxxm:layer"]);
    clouds = layerNodes.map(parseCloudLayer).filter(Boolean);
  }

  const temperature = {
    air: number(obs["iwxxm:airTemperature"]),
    dewpoint: number(obs["iwxxm:dewpointTemperature"])
  };

  const qnhNode = obs["iwxxm:qnh"] || {};
  const qnh = {
    value: number(qnhNode),
    unit: text(qnhNode?.["@_uom"]) || "hPa"
  };

  const windShear = parseWindShear(obs);

  const observation = {
    wind,
    visibility,
    weather,
    clouds,
    temperature,
    qnh,
    wind_shear: windShear
  };

  observation.display = buildDisplay(observation, { cavok, nsc: nscFlag });

  const parsed = {
    header: {
      icao:
        text(item.icaoCode) ||
        text(metar["iwxxm:aerodrome"]?.["aixm:AirportHeliport"]?.["aixm:timeSlice"]?.["aixm:AirportHeliportTimeSlice"]?.["aixm:locationIndicatorICAO"]) ||
        text(metar["iwxxm:aerodrome"]?.["aixm:AirportHeliport"]?.["aixm:timeSlice"]?.["aixm:AirportHeliportTimeSlice"]?.["aixm:designator"]),
      airport_name:
        text(item.airportName) ||
        text(item.airportNm) ||
        text(metar["iwxxm:aerodrome"]?.["aixm:AirportHeliport"]?.["aixm:timeSlice"]?.["aixm:AirportHeliportTimeSlice"]?.["aixm:name"]) ||
        null,
      issue_time: issueTime,
      observation_time: observationTime,
      automated: String(metar["@_automatedStation"] || "false").toLowerCase() === "true"
    },
    observation,
    cavok_flag: cavok,
    nsc_flag: nscFlag
  };

  // Guard: reject empty/placeholder payloads that would poison latest.json cache.
  if (!parsed.header.icao) {
    return null;
  }

  return parsed;
}

module.exports = { parse };

const fs = require("fs");
const path = require("path");
const { union } = require("@turf/union");

function dissolveByKey(features, keyFn) {
  const groups = new Map();

  for (const feature of features) {
    const key = keyFn(feature);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(feature);
  }

  const dissolved = [];
  for (const [key, group] of groups) {
    let merged = null;

    if (group.length === 1) {
      merged = group[0];
    } else {
      const fc = { type: "FeatureCollection", features: group };
      merged = union(fc);
    }

    if (!merged) continue;

    merged.properties = {
      sido: key,
      sidonm: group[0].properties?.sidonm || key,
    };
    dissolved.push(merged);
  }

  return dissolved;
}

const mapPath = path.join(__dirname, "../map.geojson");
if (!fs.existsSync(mapPath)) {
  console.error("map.geojson not found at:", mapPath);
  process.exit(1);
}

const outDir = path.join(__dirname, "../frontend/public/geo");
fs.mkdirSync(outDir, { recursive: true });

console.log("Loading map.geojson...");
const source = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const sidoFeatures = dissolveByKey(source.features || [], (feature) => feature.properties?.sido);
const output = { type: "FeatureCollection", features: sidoFeatures };
const outPath = path.join(outDir, "korea_sido.geojson");

fs.writeFileSync(outPath, `${JSON.stringify(output)}\n`, "utf8");

console.log(`Generated ${sidoFeatures.length} sido features: ${outPath}`);

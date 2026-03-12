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
      sgg: key,
      sggnm: group[0].properties?.sggnm || key,
      sido: group[0].properties?.sido || null,
      sidonm: group[0].properties?.sidonm || null
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
const sigunguFeatures = dissolveByKey(source.features || [], (feature) => feature.properties?.sgg);
const output = { type: "FeatureCollection", features: sigunguFeatures };
const outPath = path.join(outDir, "korea_sigungu.v1.geojson");

fs.writeFileSync(outPath, `${JSON.stringify(output)}\n`, "utf8");

console.log(`Generated ${sigunguFeatures.length} sigungu features: ${outPath}`);

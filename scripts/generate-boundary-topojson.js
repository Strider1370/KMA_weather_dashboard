const fs = require("fs");
const path = require("path");
const { union } = require("@turf/union");
const { topology } = require("topojson-server");

function dissolveByKey(features, keyFn, propsFn) {
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
      merged = union({ type: "FeatureCollection", features: group });
    }
    if (!merged) continue;

    merged.properties = propsFn(key, group[0]?.properties || {});
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
const sourceFeatures = source.features || [];

const sidoFeatures = dissolveByKey(
  sourceFeatures,
  (feature) => feature.properties?.sido,
  (key, props) => ({
    sido: key,
    sidonm: props.sidonm || key,
  })
);

const sigunguFeatures = dissolveByKey(
  sourceFeatures,
  (feature) => feature.properties?.sgg,
  (key, props) => ({
    sgg: key,
    sggnm: props.sggnm || key,
    sido: props.sido || null,
    sidonm: props.sidonm || null,
  })
);

const topo = topology({
  sido: { type: "FeatureCollection", features: sidoFeatures },
  sigungu: { type: "FeatureCollection", features: sigunguFeatures },
});

const outPath = path.join(outDir, "korea_boundaries.v1.topojson");
fs.writeFileSync(outPath, `${JSON.stringify(topo)}\n`, "utf8");

console.log(`Generated TopoJSON: ${outPath}`);
console.log(` - sido features: ${sidoFeatures.length}`);
console.log(` - sigungu features: ${sigunguFeatures.length}`);

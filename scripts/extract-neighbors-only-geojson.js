const fs = require("fs");
const path = require("path");

const geoPath = path.join(__dirname, "../frontend/public/geo/korea_neighbors_masked.v1.geojson");

if (!fs.existsSync(geoPath)) {
  console.error("GeoJSON not found:", geoPath);
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(geoPath, "utf8"));
const features = source.features || [];
const neighbors = features.filter((feature) => feature?.properties?.layer === "neighbors");

const output = {
  type: "FeatureCollection",
  features: neighbors,
};

fs.writeFileSync(geoPath, `${JSON.stringify(output)}\n`, "utf8");

console.log(`Wrote neighbors-only GeoJSON: ${geoPath}`);
console.log(` - kept features: ${neighbors.length}`);

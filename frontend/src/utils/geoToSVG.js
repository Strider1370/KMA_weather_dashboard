import { toCanvasXY } from './helpers';

export function geoToSVGPaths(geojson, arp, size, rangeKm) {
  const results = [];

  geojson.features.forEach((feature, fi) => {
    const geom = feature.geometry;
    let rings = [];
    if (geom.type === 'Polygon')           rings = geom.coordinates;
    else if (geom.type === 'MultiPolygon') rings = geom.coordinates.flat(1);

    rings.forEach((ring, ri) => {
      const d = ring.map((coord, i) => {
        const { x, y } = toCanvasXY({ lon: coord[0], lat: coord[1] }, arp, size, rangeKm);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ') + ' Z';

      results.push({ key: `${fi}-${ri}`, d });
    });
  });

  return results;
}

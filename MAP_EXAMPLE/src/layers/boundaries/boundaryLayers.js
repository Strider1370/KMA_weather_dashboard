export const BOUNDARY_LAYERS = [
  {
    id: 'neighbors',
    label: 'Neighbors',
    sourceId: 'kma-neighbors-boundary',
    layerId: 'kma-neighbors-boundary-line',
    data: '/geo/korea_neighbors_masked.v1.geojson',
    color: '#111111',
    width: 1.1,
    opacity: 0.78,
    defaultVisible: false,
  },
  {
    id: 'sido',
    label: 'Sido Boundary',
    sourceId: 'kma-sido-boundary',
    layerId: 'kma-sido-boundary-line',
    data: '/geo/sido.json',
    color: '#111111',
    width: 1.5,
    opacity: 0.96,
    defaultVisible: false,
  },
]

const NORMAL_BOUNDARY_STYLE = {
  lineColors: {
    neighbors: '#111111',
    sido: '#111111',
  },
  lineOpacity: {
    neighbors: 0.78,
    sido: 0.96,
  },
}

const WEATHER_BOUNDARY_STYLE = {
  lineColors: {
    neighbors: '#111111',
    sido: '#111111',
  },
  lineOpacity: {
    neighbors: 0.96,
    sido: 1,
  },
}

function boundaryStyleFor(isWeatherOverlayActive) {
  return isWeatherOverlayActive ? WEATHER_BOUNDARY_STYLE : NORMAL_BOUNDARY_STYLE
}

function lineWidthExpression(layer) {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    4,
    Math.max(0.75, layer.width - 0.45),
    8,
    Math.max(0.85, layer.width - 0.15),
    11,
    layer.width + 0.2,
  ]
}

export function createInitialBoundaryVisibility() {
  return BOUNDARY_LAYERS.reduce((visibility, layer) => {
    visibility[layer.id] = layer.defaultVisible
    return visibility
  }, {})
}

export function addBoundaryLayers(map) {
  for (const layer of BOUNDARY_LAYERS) {
    if (!map.getSource(layer.sourceId)) {
      map.addSource(layer.sourceId, {
        type: 'geojson',
        data: layer.data,
      })
    }

    if (!map.getLayer(layer.layerId)) {
      map.addLayer({
        id: layer.layerId,
        type: 'line',
        source: layer.sourceId,
        slot: 'top',
        paint: {
          'line-color': layer.color,
          'line-width': lineWidthExpression(layer),
          'line-opacity': layer.opacity,
        },
      })
    }
  }

  bringBoundaryLayersToTop(map)
}

export function applyBoundaryPaint(map, isWeatherOverlayActive) {
  const style = boundaryStyleFor(isWeatherOverlayActive)

  for (const layer of BOUNDARY_LAYERS) {
    if (map.getLayer(layer.layerId)) {
      map.setPaintProperty(layer.layerId, 'line-color', style.lineColors[layer.id] || layer.color)
      map.setPaintProperty(layer.layerId, 'line-opacity', style.lineOpacity[layer.id] ?? layer.opacity)
      map.setPaintProperty(layer.layerId, 'line-width', lineWidthExpression(layer))
    }
  }
}

export function setBoundaryVisibility(map, visibilityState) {
  for (const layer of BOUNDARY_LAYERS) {
    const visibility = visibilityState[layer.id] ? 'visible' : 'none'

    for (const layerId of [layer.layerId]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility)
      }
    }
  }
}

export function bringBoundaryLayersToTop(map) {
  for (const layer of BOUNDARY_LAYERS) {
    for (const layerId of [layer.layerId]) {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId)
      }
    }
  }
}

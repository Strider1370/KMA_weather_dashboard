import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_CONFIG } from '../../config/mapConfig.js'
import { addAviationWfsLayers } from '../../layers/aviation/addAviationWfsLayers.js'
import { AVIATION_WFS_LAYERS } from '../../layers/aviation/aviationWfsLayers.js'
import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  advisoryItemsToFeatureCollection,
  advisoryItemsToLabelFeatureCollection,
  setAdvisoryVisibility,
  updateAdvisoryLayerData,
} from '../../layers/advisories/advisoryLayers.js'
import {
  BOUNDARY_LAYERS,
  addBoundaryLayers,
  applyBoundaryPaint,
  bringBoundaryLayersToTop,
  createInitialBoundaryVisibility,
  setBoundaryVisibility,
} from '../../layers/boundaries/boundaryLayers.js'
import './MapView.css'

const ROAD_VISIBILITY_ZOOM = 8
const AIRPORT_SOURCE_ID = 'kma-airports'
const AIRPORT_CIRCLE_LAYER_ID = 'kma-airports-circle'
const AIRPORT_LABEL_LAYER_ID = 'kma-airports-label'
const SATELLITE_SOURCE_ID = 'kma-satellite-overlay'
const SATELLITE_LAYER_ID = 'kma-satellite-overlay'
const RADAR_SOURCE_ID = 'kma-radar-overlay'
const RADAR_LAYER_ID = 'kma-radar-overlay'
const WEATHER_OVERLAY_LAYERS = [
  { id: 'satellite', label: 'Satellite', layerId: SATELLITE_LAYER_ID, color: '#64748b' },
  { id: 'radar', label: 'Radar', layerId: RADAR_LAYER_ID, color: '#38bdf8' },
]
const ADVISORY_OVERLAY_LAYERS = [
  { id: 'sigmet', label: 'SIGMET', color: ADVISORY_LAYER_DEFS.sigmet.color },
  { id: 'airmet', label: 'AIRMET', color: ADVISORY_LAYER_DEFS.airmet.color },
]
const HIDDEN_ROAD_COLOR = 'rgba(255, 255, 255, 0.2)'
const VISIBLE_ROAD_COLORS = {
  roads: '#d6dde6',
  trunks: '#c6d1dd',
  motorways: '#b9c7d4',
}

function applyRoadVisibility(map, showRoads) {
  map.setConfigProperty('basemap', 'colorRoads', showRoads ? VISIBLE_ROAD_COLORS.roads : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorTrunks', showRoads ? VISIBLE_ROAD_COLORS.trunks : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorMotorways', showRoads ? VISIBLE_ROAD_COLORS.motorways : HIDDEN_ROAD_COLOR)
}

function setLayerVisibility(map, layer, isVisible) {
  const visibility = isVisible ? 'visible' : 'none'

  if (layer.fillLayerId && map.getLayer(layer.fillLayerId)) {
    map.setLayoutProperty(layer.fillLayerId, 'visibility', visibility)
  }

  if (map.getLayer(layer.lineLayerId)) {
    map.setLayoutProperty(layer.lineLayerId, 'visibility', visibility)
  }
}

function createInitialLayerVisibility() {
  return AVIATION_WFS_LAYERS.reduce((visibility, layer) => {
    visibility[layer.id] = layer.defaultVisible
    return visibility
  }, {})
}

function createInitialWeatherVisibility() {
  return WEATHER_OVERLAY_LAYERS.reduce((visibility, layer) => {
    visibility[layer.id] = false
    return visibility
  }, {})
}

function createInitialAdvisoryVisibility() {
  return ADVISORY_OVERLAY_LAYERS.reduce((visibility, layer) => {
    visibility[layer.id] = false
    return visibility
  }, {})
}

function createBoundaryVisibility(isVisible) {
  return BOUNDARY_LAYERS.reduce((visibility, layer) => {
    visibility[layer.id] = isVisible
    return visibility
  }, {})
}

function getLatestRadarFrame(echoMeta) {
  return echoMeta?.nationwide || echoMeta?.frames?.[echoMeta.frames.length - 1] || null
}

function getLatestSatelliteFrame(satMeta) {
  return satMeta?.latest || satMeta?.frames?.[satMeta.frames.length - 1] || null
}

function buildImageCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) {
    return null
  }

  const [[south, west], [north, east]] = bounds

  if (![south, west, north, east].every(Number.isFinite)) {
    return null
  }

  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}

function addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity }) {
  const coordinates = buildImageCoordinates(frame?.bounds)

  if (!frame?.path || !coordinates) {
    return false
  }

  const image = {
    url: frame.path,
    coordinates,
  }

  const source = map.getSource(sourceId)

  if (source?.updateImage) {
    source.updateImage(image)
  } else if (!source) {
    map.addSource(sourceId, {
      type: 'image',
      ...image,
    })
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      slot: 'top',
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 0,
      },
    })
  }

  return true
}

function setMapLayerVisibility(map, layerId, isVisible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none')
  }
}

function createAirportFeatureCollection(airports) {
  return {
    type: 'FeatureCollection',
    features: airports
      .filter((airport) => Number.isFinite(airport.lon) && Number.isFinite(airport.lat))
      .map((airport) => ({
        type: 'Feature',
        id: airport.icao,
        properties: {
          icao: airport.icao,
          name: airport.nameKo || airport.name || airport.icao,
        },
        geometry: {
          type: 'Point',
          coordinates: [airport.lon, airport.lat],
        },
      })),
  }
}

function addAirportLayers(map, airportData) {
  if (!map.getSource(AIRPORT_SOURCE_ID)) {
    map.addSource(AIRPORT_SOURCE_ID, {
      type: 'geojson',
      data: airportData,
    })
  }

  if (!map.getLayer(AIRPORT_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: AIRPORT_CIRCLE_LAYER_ID,
      type: 'circle',
      source: AIRPORT_SOURCE_ID,
      slot: 'top',
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          12,
          9,
        ],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#f97316',
          '#0f766e',
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
    })
  }

  if (!map.getLayer(AIRPORT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: AIRPORT_LABEL_LAYER_ID,
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      slot: 'top',
      layout: {
        'text-field': ['get', 'icao'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-offset': [0, 1.35],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }
}

function MapView({
  airports = [],
  echoMeta = null,
  satMeta = null,
  sigmetData = null,
  airmetData = null,
  selectedAirport,
  onAirportSelect,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const selectedAirportRef = useRef(selectedAirport)
  const onAirportSelectRef = useRef(onAirportSelect)
  const [layerVisibility, setLayerVisibilityState] = useState(createInitialLayerVisibility)
  const [weatherVisibility, setWeatherVisibility] = useState(createInitialWeatherVisibility)
  const [advisoryVisibility, setAdvisoryVisibilityState] = useState(createInitialAdvisoryVisibility)
  const [boundaryVisibility, setBoundaryVisibilityState] = useState(createInitialBoundaryVisibility)
  const [isStyleReady, setIsStyleReady] = useState(false)
  const airportData = useMemo(() => createAirportFeatureCollection(airports), [airports])
  const radarFrame = useMemo(() => getLatestRadarFrame(echoMeta), [echoMeta])
  const satelliteFrame = useMemo(() => getLatestSatelliteFrame(satMeta), [satMeta])
  const isWeatherOverlayActive = useMemo(
    () => Boolean((weatherVisibility.satellite && satelliteFrame) || (weatherVisibility.radar && radarFrame)),
    [radarFrame, satelliteFrame, weatherVisibility],
  )
  const sigmetFeatureData = useMemo(() => advisoryItemsToFeatureCollection(sigmetData, 'sigmet'), [sigmetData])
  const sigmetLabelData = useMemo(() => advisoryItemsToLabelFeatureCollection(sigmetData, 'sigmet'), [sigmetData])
  const airmetFeatureData = useMemo(() => advisoryItemsToFeatureCollection(airmetData, 'airmet'), [airmetData])
  const airmetLabelData = useMemo(() => advisoryItemsToLabelFeatureCollection(airmetData, 'airmet'), [airmetData])

  useEffect(() => {
    selectedAirportRef.current = selectedAirport
  }, [selectedAirport])

  useEffect(() => {
    onAirportSelectRef.current = onAirportSelect
  }, [onAirportSelect])

  function toggleAviationLayer(layerId) {
    setLayerVisibilityState((currentVisibility) => ({
      ...currentVisibility,
      [layerId]: !currentVisibility[layerId],
    }))
  }

  function toggleWeatherLayer(layerId) {
    setWeatherVisibility((currentVisibility) => ({
      ...currentVisibility,
      [layerId]: !currentVisibility[layerId],
    }))
  }

  function toggleAdvisoryLayer(layerId) {
    setAdvisoryVisibilityState((currentVisibility) => ({
      ...currentVisibility,
      [layerId]: !currentVisibility[layerId],
    }))
  }

  useEffect(() => {
    setBoundaryVisibilityState(createBoundaryVisibility(isWeatherOverlayActive))
  }, [isWeatherOverlayActive])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return undefined
    }

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      config: {
        basemap: {
          showPlaceLabels: false,
          showPedestrianRoads: false,
          showPointOfInterestLabels: false,
          showRoadLabels: false,
          show3dObjects: false,
          show3dBuildings: false,
          show3dTrees: false,
          show3dLandmarks: false,
          showIndoorLabels: false,
          theme: 'faded',
          font: 'Noto Sans CJK JP',
          colorWater: '#88bedd',
          colorGreenspace: '#c5dcb8',
        },
      },
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      language: 'ko',
      localIdeographFontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", sans-serif',
    })

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

    let airportHandlersRegistered = false
    let advisoryHandlersRegistered = false

    map.on('style.load', () => {
      let roadsVisible = map.getZoom() >= ROAD_VISIBILITY_ZOOM

      applyRoadVisibility(map, roadsVisible)
      const hasSatellite = addOrUpdateImageOverlay(map, {
        sourceId: SATELLITE_SOURCE_ID,
        layerId: SATELLITE_LAYER_ID,
        frame: satelliteFrame,
        opacity: 0.92,
      })
      const hasRadar = addOrUpdateImageOverlay(map, {
        sourceId: RADAR_SOURCE_ID,
        layerId: RADAR_LAYER_ID,
        frame: radarFrame,
        opacity: 0.88,
      })
      setMapLayerVisibility(map, SATELLITE_LAYER_ID, hasSatellite && weatherVisibility.satellite)
      setMapLayerVisibility(map, RADAR_LAYER_ID, hasRadar && weatherVisibility.radar)
      addAdvisoryLayers(map, 'sigmet', sigmetFeatureData, sigmetLabelData)
      addAdvisoryLayers(map, 'airmet', airmetFeatureData, airmetLabelData)
      setAdvisoryVisibility(map, 'sigmet', advisoryVisibility.sigmet)
      setAdvisoryVisibility(map, 'airmet', advisoryVisibility.airmet)
      addAviationWfsLayers(map, import.meta.env.VITE_VWORLD_KEY, import.meta.env.VITE_VWORLD_DOMAIN)
      AVIATION_WFS_LAYERS.forEach((layer) => {
        setLayerVisibility(map, layer, layerVisibility[layer.id])
      })
      addBoundaryLayers(map)
      applyBoundaryPaint(map, isWeatherOverlayActive)
      setBoundaryVisibility(map, boundaryVisibility)
      addAirportLayers(map, airportData)
      bringBoundaryLayersToTop(map)
      setIsStyleReady(true)

      if (!airportHandlersRegistered) {
        airportHandlersRegistered = true

        map.on('click', AIRPORT_CIRCLE_LAYER_ID, (event) => {
          const icao = event.features?.[0]?.properties?.icao

          if (icao) {
            onAirportSelectRef.current?.(icao)
          }
        })

        map.on('mouseenter', AIRPORT_CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', AIRPORT_CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      if (!advisoryHandlersRegistered) {
        advisoryHandlersRegistered = true

        const advisoryLayerIds = [
          ADVISORY_LAYER_DEFS.sigmet.fillLayerId,
          ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
          ADVISORY_LAYER_DEFS.airmet.fillLayerId,
          ADVISORY_LAYER_DEFS.airmet.lineLayerId,
        ]

        for (const layerId of advisoryLayerIds) {
          map.on('click', layerId, (event) => {
            const feature = event.features?.[0]
            const description = feature?.properties?.description

            if (!description) {
              return
            }

            new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })
              .setLngLat(event.lngLat)
              .setHTML(`<pre class="mapbox-advisory-popup">${description.replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
              }[char]))}</pre>`)
              .addTo(map)
          })

          map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer'
          })

          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = ''
          })
        }
      }

      map.on('zoom', () => {
        const shouldShowRoads = map.getZoom() >= ROAD_VISIBILITY_ZOOM

        if (shouldShowRoads !== roadsVisible) {
          roadsVisible = shouldShowRoads
          applyRoadVisibility(map, roadsVisible)
        }
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isStyleReady) {
      return
    }

    const hasSatellite = addOrUpdateImageOverlay(map, {
      sourceId: SATELLITE_SOURCE_ID,
      layerId: SATELLITE_LAYER_ID,
      frame: satelliteFrame,
      opacity: 0.92,
    })
    const hasRadar = addOrUpdateImageOverlay(map, {
      sourceId: RADAR_SOURCE_ID,
      layerId: RADAR_LAYER_ID,
      frame: radarFrame,
      opacity: 0.88,
    })

    setMapLayerVisibility(map, SATELLITE_LAYER_ID, hasSatellite && weatherVisibility.satellite)
    setMapLayerVisibility(map, RADAR_LAYER_ID, hasRadar && weatherVisibility.radar)
    applyBoundaryPaint(map, isWeatherOverlayActive)
    bringBoundaryLayersToTop(map)
  }, [radarFrame, satelliteFrame, weatherVisibility, isWeatherOverlayActive, isStyleReady])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isStyleReady) {
      return
    }

    updateAdvisoryLayerData(map, 'sigmet', sigmetFeatureData, sigmetLabelData)
    updateAdvisoryLayerData(map, 'airmet', airmetFeatureData, airmetLabelData)
    setAdvisoryVisibility(map, 'sigmet', advisoryVisibility.sigmet)
    setAdvisoryVisibility(map, 'airmet', advisoryVisibility.airmet)
  }, [sigmetFeatureData, sigmetLabelData, airmetFeatureData, airmetLabelData, advisoryVisibility, isStyleReady])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isStyleReady) {
      return
    }

    addBoundaryLayers(map)
    applyBoundaryPaint(map, isWeatherOverlayActive)
    setBoundaryVisibility(map, boundaryVisibility)
    bringBoundaryLayersToTop(map)
  }, [boundaryVisibility, isWeatherOverlayActive, isStyleReady])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isStyleReady) {
      return
    }

    addAirportLayers(map, airportData)
    map.getSource(AIRPORT_SOURCE_ID)?.setData(airportData)
  }, [airportData, isStyleReady])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isStyleReady || !map.getSource(AIRPORT_SOURCE_ID)) {
      return
    }

    for (const feature of airportData.features) {
      map.setFeatureState(
        { source: AIRPORT_SOURCE_ID, id: feature.properties.icao },
        { selected: feature.properties.icao === selectedAirport },
      )
    }
  }, [airportData, selectedAirport, isStyleReady])

  useEffect(() => {
    const map = mapRef.current

    if (!map?.isStyleLoaded()) {
      return
    }

    AVIATION_WFS_LAYERS.forEach((layer) => {
      setLayerVisibility(map, layer, layerVisibility[layer.id])
    })
  }, [layerVisibility])

  return (
    <div className="map-view-wrapper">
      <div ref={mapContainerRef} className="map-view" />
      <div className="dev-layer-panel" aria-label="Developer layer toggles">
        <div className="dev-layer-panel-title">Layers</div>
        <div className="dev-layer-section-title">Weather</div>
        {WEATHER_OVERLAY_LAYERS.map((layer) => (
          <label key={layer.id} className="dev-layer-toggle">
            <input
              type="checkbox"
              checked={weatherVisibility[layer.id]}
              onChange={() => toggleWeatherLayer(layer.id)}
              disabled={layer.id === 'radar' ? !radarFrame : !satelliteFrame}
            />
            <span className="dev-layer-swatch" style={{ background: layer.color }} />
            <span>{layer.label}</span>
          </label>
        ))}
        <div className="dev-layer-section-title">Advisory</div>
        {ADVISORY_OVERLAY_LAYERS.map((layer) => {
          const hasItems = layer.id === 'sigmet'
            ? sigmetFeatureData.features.length > 0
            : airmetFeatureData.features.length > 0

          return (
            <label key={layer.id} className="dev-layer-toggle">
              <input
                type="checkbox"
                checked={advisoryVisibility[layer.id]}
                onChange={() => toggleAdvisoryLayer(layer.id)}
                disabled={!hasItems}
              />
              <span className="dev-layer-swatch" style={{ background: layer.color }} />
              <span>{layer.label}</span>
              <span className="dev-layer-count">{hasItems ? (layer.id === 'sigmet' ? sigmetFeatureData.features.length : airmetFeatureData.features.length) : 0}</span>
            </label>
          )
        })}
        <div className="dev-layer-section-title">Aviation</div>
        {AVIATION_WFS_LAYERS.map((layer) => (
          <label key={layer.id} className="dev-layer-toggle">
            <input
              type="checkbox"
              checked={layerVisibility[layer.id]}
              onChange={() => toggleAviationLayer(layer.id)}
            />
            <span className="dev-layer-swatch" style={{ background: layer.color }} />
            <span>{layer.nameEn}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default MapView

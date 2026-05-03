import { useEffect, useState } from 'react'
import { loadAirportWeatherData } from './api/weatherApi.js'
import AirportWeatherPanel from './components/AirportWeatherPanel/AirportWeatherPanel.jsx'
import MapView from './components/Map/MapView.jsx'
import Sidebar from './components/Sidebar/Sidebar.jsx'

function formatUtcTime(date) {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${day}/${month} ${hours}:${minutes} UTC`
}

function App() {
  const [utcTime, setUtcTime] = useState(() => formatUtcTime(new Date()))
  const [weatherData, setWeatherData] = useState({
    airports: [],
    metar: null,
    taf: null,
    amos: null,
    warning: null,
    echoMeta: null,
    satMeta: null,
    sigmet: null,
    airmet: null,
  })
  const [selectedAirport, setSelectedAirport] = useState(null)
  const [isWeatherLoading, setIsWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUtcTime(formatUtcTime(new Date()))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setIsWeatherLoading(true)
      setWeatherError(null)

      try {
        const nextData = await loadAirportWeatherData()

        if (!isMounted) {
          return
        }

        setWeatherData(nextData)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setWeatherError(error.message || '데이터를 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsWeatherLoading(false)
        }
      }
    }

    loadData()
    const timer = window.setInterval(loadData, 60_000)

    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [])

  const selectedAirportMeta = weatherData.airports.find((airport) => airport.icao === selectedAirport) || null

  return (
    <div className="app">
      <Sidebar />
      <main className="map-shell">
        <MapView
          airports={weatherData.airports}
          echoMeta={weatherData.echoMeta}
          satMeta={weatherData.satMeta}
          sigmetData={weatherData.sigmet}
          airmetData={weatherData.airmet}
          selectedAirport={selectedAirport}
          onAirportSelect={setSelectedAirport}
        />
      </main>
      <AirportWeatherPanel
        airport={selectedAirportMeta}
        data={weatherData}
        loading={isWeatherLoading}
        error={weatherError}
        onClose={() => setSelectedAirport(null)}
      />
      <div className="utc-bar">{utcTime}</div>
    </div>
  )
}

export default App

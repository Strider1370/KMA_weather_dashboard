import { useState } from 'react'
import { X } from 'lucide-react'
import { AIRPORT_NAME_KO } from '../../api/weatherApi.js'
import {
  DEFAULT_AIRPORT_MINIMA_RULES,
  formatUtc,
  normalizeAirportMinimaSettings,
} from '../../../../frontend/src/utils/helpers.js'
import MetarCard from '../../../../frontend/src/components/MetarCard.jsx'
import TafTimeline from '../../../../frontend/src/components/TafTimeline.jsx'
import WarningList from '../../../../frontend/src/components/WarningList.jsx'
import './AirportWeatherPanel.css'

const PANEL_TABS = [
  { id: 'current', label: '현재상황' },
  { id: 'metar', label: '메타' },
  { id: 'taf', label: '타프' },
  { id: 'etc', label: '기타' },
]

const minimaSettings = normalizeAirportMinimaSettings(DEFAULT_AIRPORT_MINIMA_RULES)

function formatTime(value) {
  if (!value) {
    return '-'
  }

  const formatted = formatUtc(value, 'KST')
  return formatted || value
}

function EtcPanel({ airport, data }) {
  const icao = airport.icao
  const amos = data.amos?.airports?.[icao] || null
  const warning = data.warning?.airports?.[icao] || null
  const metar = data.metar?.airports?.[icao] || null
  const taf = data.taf?.airports?.[icao] || null

  return (
    <div className="airport-etc-panel">
      <section className="airport-etc-card">
        <h3>데이터 상태</h3>
        <div className="airport-etc-grid">
          <span>METAR</span>
          <strong>{metar ? formatTime(metar.header?.observation_time || metar.header?.issue_time) : '-'}</strong>
          <span>TAF</span>
          <strong>{taf ? formatTime(taf.header?.issued || taf.header?.valid_start) : '-'}</strong>
          <span>AMOS</span>
          <strong>{amos?.daily_rainfall?.observed_tm_kst || '-'}</strong>
          <span>WARNING</span>
          <strong>{warning?.warnings?.length ? `${warning.warnings.length}건` : '없음'}</strong>
        </div>
      </section>
      <section className="airport-etc-card">
        <h3>AMOS</h3>
        <div className="airport-etc-grid">
          <span>관측소</span>
          <strong>{amos?.amos_stn ?? airport.amos_stn ?? '-'}</strong>
          <span>일강수량</span>
          <strong>{amos?.daily_rainfall?.mm == null ? '-' : `${amos.daily_rainfall.mm} mm`}</strong>
          <span>상태</span>
          <strong>{amos?.daily_rainfall?.stale ? '이전 데이터' : '최신'}</strong>
        </div>
      </section>
    </div>
  )
}

function AirportWeatherPanel({ airport, data, loading, error, onClose }) {
  const [activeTab, setActiveTab] = useState('current')
  const [tafVersion, setTafVersion] = useState('v2')

  if (!airport) {
    return null
  }

  const icao = airport.icao
  const airportName = airport.nameKo || AIRPORT_NAME_KO[icao] || airport.name || icao
  const metarTarget = data.metar?.airports?.[icao] || null
  const metarTime = formatTime(metarTarget?.header?.issue_time || metarTarget?.header?.observation_time)

  const warningPanel = (
    <WarningList
      warningData={data.warning}
      groundOverviewData={data.groundOverview}
      icao={icao}
      warningTypes={data.warningTypes}
      dashboardMode="ops"
      tz="KST"
    />
  )
  const metarPanel = (
    <MetarCard
      metarData={data.metar}
      amosData={data.amos}
      icao={icao}
      minimaSettings={minimaSettings}
      airportMeta={airport}
      metarTime={metarTime}
      version="v2"
      tz="KST"
    />
  )
  const tafPanel = (
    <TafTimeline
      tafData={data.taf}
      icao={icao}
      minimaSettings={minimaSettings}
      version={tafVersion}
      onVersionToggle={setTafVersion}
      tz="KST"
    />
  )

  return (
    <aside className="airport-panel">
      <nav className="airport-panel-tabs" aria-label="공항 기상 탭">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`airport-panel-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="airport-panel-main">
        <header className="airport-panel-header">
          <div>
            <div className="airport-panel-eyebrow">Airport Weather</div>
            <h2>{airportName}</h2>
            <p>{icao}</p>
          </div>
          <button type="button" className="airport-panel-close" onClick={onClose} aria-label="공항 패널 닫기">
            <X size={18} />
          </button>
        </header>

        {loading && <div className="airport-panel-status">데이터를 불러오는 중입니다.</div>}
        {error && <div className="airport-panel-error">{error}</div>}

        <div className="airport-panel-body">
          {activeTab === 'current' && (
            <div className="airport-tab-content airport-tab-content--current">
              {warningPanel}
              {metarPanel}
              {tafPanel}
            </div>
          )}
          {activeTab === 'metar' && (
            <div className="airport-tab-content">
              {metarPanel}
            </div>
          )}
          {activeTab === 'taf' && (
            <div className="airport-tab-content">
              {tafPanel}
            </div>
          )}
          {activeTab === 'etc' && <EtcPanel airport={airport} data={data} />}
        </div>
      </div>
    </aside>
  )
}

export default AirportWeatherPanel

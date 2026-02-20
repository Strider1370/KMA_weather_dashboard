import { useState, useEffect, useCallback, useRef } from "react";
import { loadAllData, loadAlertDefaults, triggerRefresh } from "./utils/api";
import {
  evaluate,
  buildAlertKey,
  isInCooldown,
  recordAlert,
  clearResolvedAlerts,
  dispatch,
  isQuietHours,
  resolveSettings,
  setAlertCallback,
} from "./utils/alerts";
import Header from "./components/Header";
import SummaryGrid from "./components/SummaryGrid";
import StatusPanel from "./components/StatusPanel";
import MetarCard from "./components/MetarCard";
import WarningList from "./components/WarningList";
import TafTimeline from "./components/TafTimeline";
import LightningMap from "./components/LightningMap";
import RadarPanel from "./components/RadarPanel";
import AlertPopup from "./components/alerts/AlertPopup";
import AlertSound from "./components/alerts/AlertSound";
import AlertMarquee from "./components/alerts/AlertMarquee";
import Settings from "./components/alerts/Settings";
import "./App.css";

export default function App() {
  const [data, setData] = useState({});
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [alertDefaults, setAlertDefaults] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // UI Version states
  const [metarVersion, setMetarVersion] = useState(() => localStorage.getItem("metar_version") || "v1");
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem("taf_version") || "v1");
  const [boundaryLevel, setBoundaryLevel] = useState(() => localStorage.getItem("lightning_boundary") || "sigungu");
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem("time_zone") || "KST");

  useEffect(() => {
    localStorage.setItem("metar_version", metarVersion);
  }, [metarVersion]);

  useEffect(() => {
    localStorage.setItem("taf_version", tafVersion);
  }, [tafVersion]);

  useEffect(() => {
    localStorage.setItem("time_zone", timeZone);
  }, [timeZone]);

  const prevDataRef = useRef(null);
  const pollingRef = useRef(null);

  // 디스패처 콜백 등록
  useEffect(() => {
    setAlertCallback((alertObj) => {
      setActiveAlerts((prev) => [alertObj, ...prev].slice(0, 20));
    });
    return () => setAlertCallback(null);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, defaults] = await Promise.all([
        loadAllData(),
        alertDefaults ? Promise.resolve(alertDefaults) : loadAlertDefaults(),
      ]);
      setData(result);
      if (!alertDefaults) setAlertDefaults(defaults);

      setSelectedAirport((prev) => {
        const available = new Set([
          ...Object.keys(result.metar?.airports || {}),
          ...Object.keys(result.taf?.airports || {}),
          ...Object.keys(result.warning?.airports || {}),
          ...Object.keys(result.lightning?.airports || {}),
          ...(result.airports || []).map((a) => a.icao),
        ]);
        if (prev && available.has(prev)) return prev;
        return Array.from(available).sort()[0] || null;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [alertDefaults]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Alert evaluation
  useEffect(() => {
    if (!selectedAirport || !alertDefaults) return;

    const settings = resolveSettings(alertDefaults);
    if (!settings.global.alerts_enabled) return;
    if (isQuietHours(settings.global.quiet_hours)) return;

    const currentData = {
      metar: data.metar?.airports?.[selectedAirport] || null,
      taf: data.taf?.airports?.[selectedAirport] || null,
      warning: data.warning?.airports?.[selectedAirport] || null,
      lightning: data.lightning?.airports?.[selectedAirport] || null,
    };

    const prev = prevDataRef.current;
    const previousData = prev
      ? {
          metar: prev.metar?.airports?.[selectedAirport] || null,
          taf: prev.taf?.airports?.[selectedAirport] || null,
          warning: prev.warning?.airports?.[selectedAirport] || null,
          lightning: prev.lightning?.airports?.[selectedAirport] || null,
        }
      : null;

    const results = evaluate(currentData, previousData, settings);
    const firedKeys = new Set();

    for (const result of results) {
      const key = buildAlertKey(result, selectedAirport);
      firedKeys.add(key);

      if (isInCooldown(key, settings.global.cooldown_seconds)) continue;

      recordAlert(key);
      dispatch(result, settings.dispatchers, selectedAirport);
    }

    clearResolvedAlerts(firedKeys);
    prevDataRef.current = data;
  }, [data, selectedAirport, alertDefaults]);

  // Auto-polling
  useEffect(() => {
    if (!alertDefaults) return;

    const settings = resolveSettings(alertDefaults);
    const intervalSec = settings.global.poll_interval_seconds || 30;

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(() => {
      loadAll();
    }, intervalSec * 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [alertDefaults, loadAll]);

  async function handleRefresh() {
    setLoading(true);
    try {
      await triggerRefresh();
      await loadAll();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function handleDismissAlert(id) {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  function handleSettingsChange() {
    // 설정 변경 시 alertDefaults를 다시 로드하여 resolveSettings가 새 값을 반영
    loadAlertDefaults().then((defaults) => setAlertDefaults({ ...defaults }));
    
    // UI 버전 상태도 localStorage에서 다시 읽어옴
    setMetarVersion(localStorage.getItem("metar_version") || "v1");
    setTafVersion(localStorage.getItem("taf_version") || "v1");
    setBoundaryLevel(localStorage.getItem("lightning_boundary") || "sigungu");
    setTimeZone(localStorage.getItem("time_zone") || "UTC");
  }

  const settings = alertDefaults ? resolveSettings(alertDefaults) : null;

  const airportSet = new Set([
    ...Object.keys(data.metar?.airports || {}),
    ...Object.keys(data.lightning?.airports || {}),
  ]);
  if (data.airports) {
    data.airports.forEach((a) => airportSet.add(a.icao));
  }
  const airportList = Array.from(airportSet).sort();

  const lastUpdated = [data.metar?.fetched_at, data.taf?.fetched_at, data.warning?.fetched_at, data.lightning?.fetched_at, data.radar?.updated_at]
    .filter(Boolean)
    .sort()
    .pop() || null;

  return (
    <>
      <div className="bg-shape shape-a" />
      <div className="bg-shape shape-b" />

      {/* Alert UI components */}
      {settings && (
        <>
          <AlertPopup
            alerts={activeAlerts}
            onDismiss={handleDismissAlert}
            settings={settings.dispatchers.popup}
          />
          <AlertSound
            alerts={activeAlerts}
            settings={settings.dispatchers.sound}
          />
          <AlertMarquee
            alerts={activeAlerts}
            settings={settings.dispatchers.marquee}
          />
        </>
      )}

      <main className="container">
        <Header
          lastUpdated={lastUpdated}
          onSettingsClick={() => setShowSettings(true)}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((prev) => !prev)}
          airports={airportList}
          selectedAirport={selectedAirport}
          onAirportChange={setSelectedAirport}
          onRefresh={handleRefresh}
          tz={timeZone}
        />

        {loading && !data.metar && (
          <p className="loading-message">Loading data...</p>
        )}

        {error && (
          <p className="error-message">Load failed: {error}</p>
        )}

        {data.metar && (
          <>
            {detailsOpen && (
              <>
              <SummaryGrid
                metar={data.metar}
                taf={data.taf}
                warning={data.warning}
                lightning={data.lightning}
              />
              <StatusPanel status={data.status} tz={timeZone} />
              </>
            )}
            <section className="dashboard-layout">
              <div className="primary-column">
                <div className="dashboard-top-row">
                  <MetarCard
                    metarData={data.metar}
                    icao={selectedAirport}
                    version={metarVersion}
                    onVersionToggle={setMetarVersion}
                    tz={timeZone}
                  />
                  <WarningList
                    warningData={data.warning}
                    icao={selectedAirport}
                    warningTypes={data.warningTypes}
                    tz={timeZone}
                  />
                </div>
                <div className="dashboard-bottom-row">
                  <TafTimeline
                    tafData={data.taf}
                    icao={selectedAirport}
                    version={tafVersion}
                    onVersionToggle={setTafVersion}
                    tz={timeZone}
                  />
                </div>
              </div>

              <div className="secondary-column">
                <LightningMap
                  lightningData={data.lightning}
                  selectedAirport={selectedAirport}
                  airports={data.airports}
                  boundaryLevel={boundaryLevel}
                  windDir={(() => {
                    const w = data.metar?.airports?.[selectedAirport]?.observation?.wind;
                    if (!w || w.calm || w.variable) return null;
                    return w.direction;
                  })()}
                />
                <RadarPanel
                  radarData={data.radar}
                  selectedAirport={selectedAirport}
                />
              </div>
            </section>
          </>
        )}
      </main>

      {showSettings && alertDefaults && (
        <Settings
          defaults={alertDefaults}
          onClose={() => setShowSettings(false)}
          onSettingsChange={handleSettingsChange}
          timeZone={timeZone}
          setTimeZone={setTimeZone}
        />
      )}
    </>
  );
}

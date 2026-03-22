import { useState, useEffect, useCallback, useRef } from "react";
import {
  loadAllData,
  loadAlertDefaults,
  loadStaticData,
  fetchSnapshotMeta,
  loadChangedData,
} from "./utils/api";
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
import MetarCard from "./components/MetarCard";
import WarningList from "./components/WarningList";
import TafTimeline from "./components/TafTimeline";
import InteractiveMap from "./components/InteractiveMap";
import AlertPopup from "./components/alerts/AlertPopup";
import AlertSound from "./components/alerts/AlertSound";
import AlertMarquee from "./components/alerts/AlertMarquee";
import Settings from "./components/alerts/Settings";
import "./App.css";

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const isTestPage = pathname === "/test";
  const defaultAirport = isTestPage ? "TST1" : "RKSI";
  const selectedAirportKey = isTestPage ? "selected_airport_test" : "selected_airport_main";

  const [data, setData] = useState({});
  const [selectedAirport, setSelectedAirport] = useState(() => localStorage.getItem(selectedAirportKey) || defaultAirport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertDefaults, setAlertDefaults] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // UI Version states
  const [metarVersion, setMetarVersion] = useState(() => localStorage.getItem("metar_version") || "v1");
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem("taf_version") || "v1");
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem("time_zone") || "KST");
  const radarOpacity = 1;
  const [mapTheme, setMapTheme] = useState(() => localStorage.getItem("map_theme") || "light");

  useEffect(() => {
    localStorage.setItem("metar_version", metarVersion);
  }, [metarVersion]);

  useEffect(() => {
    localStorage.setItem("taf_version", tafVersion);
  }, [tafVersion]);

  useEffect(() => {
    localStorage.setItem("time_zone", timeZone);
  }, [timeZone]);

  useEffect(() => {
    localStorage.setItem("map_theme", mapTheme);
  }, [mapTheme]);

  useEffect(() => {
    if (selectedAirport) {
      localStorage.setItem(selectedAirportKey, selectedAirport);
    }
  }, [selectedAirport, selectedAirportKey]);

  const prevDataRef = useRef(null);
  const pollingRef = useRef(null);
  const pollingInFlightRef = useRef(false);
  const snapshotHashRef = useRef({ metar: null, taf: null, warning: null, lightning: null, adsb: null, echo: null });

  // 디스패처 콜백 등록
  useEffect(() => {
    setAlertCallback((alertObj) => {
      setActiveAlerts((prev) => [alertObj, ...prev].slice(0, 20));
    });
    return () => setAlertCallback(null);
  }, []);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { airports, warningTypes, alertDefaults: defaults } = await loadStaticData();
      setAlertDefaults(defaults);

      const result = await loadAllData();
      setData((prev) => ({ ...prev, ...result, airports, warningTypes }));

      setSelectedAirport((prev) => {
        const available = new Set([
          ...Object.keys(result.metar?.airports || {}),
          ...Object.keys(result.taf?.airports || {}),
          ...Object.keys(result.warning?.airports || {}),
          ...Object.keys(result.lightning?.airports || {}),
          ...(airports || [])
            .filter((airport) => isTestPage || airport.icao !== "TST1")
            .map((a) => a.icao),
        ]);
        if (prev && available.has(prev)) return prev;
        if (available.has(defaultAirport)) return defaultAirport;
        return Array.from(available)[0] || null;
      });

      snapshotHashRef.current = {
        metar: result.metar?.content_hash || null,
        taf: result.taf?.content_hash || null,
        warning: result.warning?.content_hash || null,
        lightning: result.lightning?.content_hash || null,
        adsb: result.adsb?.content_hash || null,
        echo: result.echoMeta?.tm || null,
      };
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [defaultAirport, isTestPage]);

  const pollOnce = useCallback(async () => {
    if (pollingInFlightRef.current) return;
    pollingInFlightRef.current = true;

    try {
      let snapshot;
      try {
        snapshot = await fetchSnapshotMeta();
      } catch {
        return;
      }

      const saved = snapshotHashRef.current;
      const changes = {
        metar: snapshot.metar?.hash == null || snapshot.metar.hash !== saved.metar,
        taf: snapshot.taf?.hash == null || snapshot.taf.hash !== saved.taf,
        warning: snapshot.warning?.hash == null || snapshot.warning.hash !== saved.warning,
        lightning: snapshot.lightning?.hash == null || snapshot.lightning.hash !== saved.lightning,
        adsb: snapshot.adsb?.hash == null || snapshot.adsb.hash !== saved.adsb,
        echoMeta: snapshot.echo?.tm == null || snapshot.echo.tm !== saved.echo,
      };

      const anyChanged = Object.values(changes).some(Boolean);
      if (!anyChanged) return;

      const changedData = await loadChangedData(changes);
      setData((prev) => ({ ...prev, ...changedData }));

      snapshotHashRef.current = {
        metar: changes.metar && changedData.metar?.content_hash != null
          ? changedData.metar.content_hash
          : (snapshot.metar?.hash ?? saved.metar),
        taf: changes.taf && changedData.taf?.content_hash != null
          ? changedData.taf.content_hash
          : (snapshot.taf?.hash ?? saved.taf),
        warning: changes.warning && changedData.warning?.content_hash != null
          ? changedData.warning.content_hash
          : (snapshot.warning?.hash ?? saved.warning),
        lightning: changes.lightning && changedData.lightning?.content_hash != null
          ? changedData.lightning.content_hash
          : (snapshot.lightning?.hash ?? saved.lightning),
        adsb: changes.adsb && changedData.adsb?.content_hash != null
          ? changedData.adsb.content_hash
          : (snapshot.adsb?.hash ?? saved.adsb),
        echo: changes.echoMeta && changedData.echoMeta?.tm != null
          ? changedData.echoMeta.tm
          : (snapshot.echo?.tm ?? saved.echo),
      };
    } finally {
      pollingInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

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
      pollOnce();
    }, intervalSec * 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [alertDefaults, pollOnce]);

  function handleDismissAlert(id) {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  function handleSettingsChange() {
    // 설정 변경 시 alertDefaults를 다시 로드하여 resolveSettings가 새 값을 반영
    loadAlertDefaults().then((defaults) => setAlertDefaults({ ...defaults }));
    
    // UI 버전 상태도 localStorage에서 다시 읽어옴
    setMetarVersion(localStorage.getItem("metar_version") || "v1");
    setTafVersion(localStorage.getItem("taf_version") || "v1");
    setTimeZone(localStorage.getItem("time_zone") || "KST");
    setMapTheme(localStorage.getItem("map_theme") || "light");
  }

  const settings = alertDefaults ? resolveSettings(alertDefaults) : null;

  const airportSet = new Set([
    ...Object.keys(data.metar?.airports || {}),
    ...Object.keys(data.lightning?.airports || {}),
  ]);
  if (data.airports) {
    data.airports
      .filter((airport) => isTestPage || airport.icao !== "TST1")
      .forEach((a) => airportSet.add(a.icao));
  }
  const orderedAirports = (data.airports || [])
    .filter((airport) => isTestPage || airport.icao !== "TST1")
    .map((airport) => airport.icao)
    .filter((icao) => airportSet.has(icao));
  const remainingAirports = Array.from(airportSet)
    .filter((icao) => !orderedAirports.includes(icao))
    .sort();
  const airportList = [...orderedAirports, ...remainingAirports];

  const lastUpdated = [data.metar?.fetched_at, data.taf?.fetched_at, data.warning?.fetched_at, data.lightning?.fetched_at, data.adsb?.updated_at, data.echoMeta?.updated_at]
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
          airports={airportList}
          selectedAirport={selectedAirport}
          onAirportChange={setSelectedAirport}
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
                <InteractiveMap
                  lightningData={data.lightning}
                  adsbData={data.adsb}
                  selectedAirport={selectedAirport}
                  airports={data.airports}
                  windDir={(() => {
                    const w = data.metar?.airports?.[selectedAirport]?.observation?.wind;
                    if (!w || w.calm || w.variable) return null;
                    return w.direction;
                  })()}
                  echoMeta={data.echoMeta}
                  radarOpacity={radarOpacity}
                  mapTheme={mapTheme}
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
          mapTheme={mapTheme}
          setMapTheme={setMapTheme}
        />
      )}
    </>
  );
}

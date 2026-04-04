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
import {
  formatUtc,
  getFlightCategory,
  DEFAULT_AIRPORT_MINIMA_RULES,
  normalizeAirportMinimaSettings,
} from "./utils/helpers";
import { getCurrentRouteContext } from "./utils/route-mode";
import Header from "./components/Header";
import MetarCard from "./components/MetarCard";
import WarningList from "./components/WarningList";
import TafTimeline from "./components/TafTimeline";
import InteractiveMap from "./components/InteractiveMap";
import GroundForecastPanel from "./components/GroundForecastPanel";
import AlertPopup from "./components/alerts/AlertPopup";
import AlertSound from "./components/alerts/AlertSound";
import AlertMarquee from "./components/alerts/AlertMarquee";
import Settings from "./components/alerts/Settings";
import "./App.css";

const AIRPORT_NAME_KO = {
  RKSI: "인천국제공항",
  RKSS: "김포국제공항",
  RKPC: "제주국제공항",
  RKPK: "김해국제공항",
  RKJB: "무안국제공항",
  RKNY: "양양국제공항",
  RKPU: "울산공항",
  RKJY: "여수공항",
};

export default function App() {
  const routeContext = getCurrentRouteContext();
  const { isTestPage, dashboardMode, selectedAirportKey } = routeContext;
  const defaultAirport = "RKSI";

  const [data, setData] = useState({});
  const [selectedAirport, setSelectedAirport] = useState(() => localStorage.getItem(selectedAirportKey) || defaultAirport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertDefaults, setAlertDefaults] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  // UI Version states (kept for dead-code paths in MetarCard/TafTimeline)
  const [metarVersion] = useState("v2");
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem("taf_view_mode") || "v2");
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem("time_zone") || "KST");
  const radarOpacity = 1;
  const [mapTheme, setMapTheme] = useState(() => localStorage.getItem("map_theme") || "light");
  const [trafficCallsignFilter, setTrafficCallsignFilter] = useState(() => localStorage.getItem("traffic_callsign_filter") || "");
  const [trafficAltitudeBands, setTrafficAltitudeBands] = useState(() => {
    const ALL_BANDS = ["0-10000", "10000-20000", "20000-30000", "30000-40000", "40000-50000"];
    const raw = localStorage.getItem("traffic_altitude_bands");
    if (!raw) return ALL_BANDS;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : ALL_BANDS;
    } catch {
      return ALL_BANDS;
    }
  });
  const [airportMinimaSettings, setAirportMinimaSettings] = useState(() => {
    const raw = localStorage.getItem("airport_minima_settings");
    if (!raw) return normalizeAirportMinimaSettings(DEFAULT_AIRPORT_MINIMA_RULES);
    try {
      return normalizeAirportMinimaSettings(JSON.parse(raw));
    } catch {
      return normalizeAirportMinimaSettings(DEFAULT_AIRPORT_MINIMA_RULES);
    }
  });

  useEffect(() => {
    localStorage.setItem("time_zone", timeZone);
  }, [timeZone]);

  useEffect(() => {
    localStorage.setItem("map_theme", mapTheme);
    document.documentElement.setAttribute("data-theme", mapTheme);
  }, [mapTheme]);

  useEffect(() => {
    localStorage.setItem("taf_view_mode", tafVersion);
  }, [tafVersion]);

  useEffect(() => {
    localStorage.setItem("traffic_callsign_filter", trafficCallsignFilter);
  }, [trafficCallsignFilter]);

  useEffect(() => {
    localStorage.setItem("traffic_altitude_bands", JSON.stringify(trafficAltitudeBands));
  }, [trafficAltitudeBands]);

  useEffect(() => {
    localStorage.setItem("airport_minima_settings", JSON.stringify(airportMinimaSettings));
  }, [airportMinimaSettings]);

  useEffect(() => {
    if (selectedAirport) {
      localStorage.setItem(selectedAirportKey, selectedAirport);
      setActiveAlerts([]);
    }
  }, [selectedAirport, selectedAirportKey]);

  const prevDataRef = useRef(null);
  const pollingRef = useRef(null);
  const pollingInFlightRef = useRef(false);
  const snapshotHashRef = useRef({ metar: null, taf: null, warning: null, sigmet: null, airmet: null, sigwxLow: null, amos: null, lightning: null, adsb: null, groundForecast: null, groundOverview: null, echo: null, satellite: null });

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
            .filter((airport) => airport.icao !== "TST1")
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
        sigmet: result.sigmet?.content_hash || null,
        airmet: result.airmet?.content_hash || null,
        sigwxLow: result.sigwxLow?.content_hash || null,
        amos: result.amos?.content_hash || null,
        lightning: result.lightning?.content_hash || null,
        adsb: result.adsb?.content_hash || null,
        groundForecast: result.groundForecast?.content_hash || null,
        groundOverview: result.groundOverview?.content_hash || null,
        echo: result.echoMeta?.tm || null,
        satellite: result.satMeta?.tm || null,
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
        sigmet: snapshot.sigmet?.hash == null || snapshot.sigmet.hash !== saved.sigmet,
        airmet: snapshot.airmet?.hash == null || snapshot.airmet.hash !== saved.airmet,
        sigwxLow: snapshot.sigwx_low?.hash == null || snapshot.sigwx_low.hash !== saved.sigwxLow,
        amos: snapshot.amos?.hash == null || snapshot.amos.hash !== saved.amos,
        lightning: snapshot.lightning?.hash == null || snapshot.lightning.hash !== saved.lightning,
        adsb: snapshot.adsb?.hash == null || snapshot.adsb.hash !== saved.adsb,
        groundForecast: snapshot.ground_forecast?.hash == null || snapshot.ground_forecast.hash !== saved.groundForecast,
        groundOverview: snapshot.ground_overview?.hash == null || snapshot.ground_overview.hash !== saved.groundOverview,
        echoMeta: snapshot.echo?.tm == null || snapshot.echo.tm !== saved.echo,
        satMeta: snapshot.satellite?.tm == null || snapshot.satellite.tm !== saved.satellite,
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
        sigmet: changes.sigmet && changedData.sigmet?.content_hash != null
          ? changedData.sigmet.content_hash
          : (snapshot.sigmet?.hash ?? saved.sigmet),
        airmet: changes.airmet && changedData.airmet?.content_hash != null
          ? changedData.airmet.content_hash
          : (snapshot.airmet?.hash ?? saved.airmet),
        sigwxLow: changes.sigwxLow && changedData.sigwxLow?.content_hash != null
          ? changedData.sigwxLow.content_hash
          : (snapshot.sigwx_low?.hash ?? saved.sigwxLow),
        amos: changes.amos && changedData.amos?.content_hash != null
          ? changedData.amos.content_hash
          : (snapshot.amos?.hash ?? saved.amos),
        lightning: changes.lightning && changedData.lightning?.content_hash != null
          ? changedData.lightning.content_hash
          : (snapshot.lightning?.hash ?? saved.lightning),
        adsb: changes.adsb && changedData.adsb?.content_hash != null
          ? changedData.adsb.content_hash
          : (snapshot.adsb?.hash ?? saved.adsb),
        groundForecast: changes.groundForecast && changedData.groundForecast?.content_hash != null
          ? changedData.groundForecast.content_hash
          : (snapshot.ground_forecast?.hash ?? saved.groundForecast),
        groundOverview: changes.groundOverview && changedData.groundOverview?.content_hash != null
          ? changedData.groundOverview.content_hash
          : (snapshot.ground_overview?.hash ?? saved.groundOverview),
        echo: changes.echoMeta && changedData.echoMeta?.tm != null
          ? changedData.echoMeta.tm
          : (snapshot.echo?.tm ?? saved.echo),
        satellite: changes.satMeta && changedData.satMeta?.tm != null
          ? changedData.satMeta.tm
          : (snapshot.satellite?.tm ?? saved.satellite),
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
    loadAlertDefaults().then((defaults) => setAlertDefaults({ ...defaults }));
    setTimeZone(localStorage.getItem("time_zone") || "KST");
    setMapTheme(localStorage.getItem("map_theme") || "light");
    try {
      const raw = localStorage.getItem("airport_minima_settings");
      setAirportMinimaSettings(normalizeAirportMinimaSettings(raw ? JSON.parse(raw) : DEFAULT_AIRPORT_MINIMA_RULES));
    } catch {
      setAirportMinimaSettings(normalizeAirportMinimaSettings(DEFAULT_AIRPORT_MINIMA_RULES));
    }
  }

  const settings = alertDefaults ? resolveSettings(alertDefaults) : null;

  const airportSet = new Set([
    ...Object.keys(data.metar?.airports || {}),
    ...Object.keys(data.lightning?.airports || {}),
  ]);
  if (data.airports) {
    data.airports
      .filter((airport) => airport.icao !== "TST1")
      .forEach((a) => airportSet.add(a.icao));
  }
  const orderedAirports = (data.airports || [])
    .filter((airport) => airport.icao !== "TST1")
    .map((airport) => airport.icao)
    .filter((icao) => airportSet.has(icao));
  const remainingAirports = Array.from(airportSet)
    .filter((icao) => !orderedAirports.includes(icao))
    .sort();
  const airportList = [...orderedAirports, ...remainingAirports];
  const airportOptions = airportList.map((icao) => {
    const airport = data.airports?.find((item) => item.icao === icao) || null;
    const airportName = AIRPORT_NAME_KO[icao] || airport?.name || icao;
    return {
      icao,
      label: `${airportName}(${icao})`,
    };
  });

  // Flight category from current METAR
  const metarTarget = data.metar?.airports?.[selectedAirport];
  const selectedAirportMeta = data.airports?.find((airport) => airport.icao === selectedAirport) || null;
  const metarVis = metarTarget?.observation?.visibility?.value ?? null;
  const metarClouds = metarTarget?.observation?.clouds || [];
  const metarCeiling = metarClouds
    .filter(c => c.amount === "BKN" || c.amount === "OVC")
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null;
  const flightCat = getFlightCategory(metarVis, metarCeiling, selectedAirport, airportMinimaSettings);

  const metarTime = (() => {
    const t = metarTarget?.header?.issue_time || metarTarget?.header?.observation_time;
    if (!t) return "";
    return formatUtc(t, timeZone);
  })();
  const airportLabel = (() => {
    const icao = selectedAirport || "----";
    const airportName = AIRPORT_NAME_KO[icao] || selectedAirportMeta?.name || metarTarget?.header?.airport_name || icao;
    return `${airportName}(${icao})`;
  })();

  return (
    <>
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

      {loading && !data.metar && (
        <div className="loading-overlay">
          <p className="loading-message">Loading data...</p>
        </div>
      )}

      {error && (
        <div className="loading-overlay">
          <p className="error-message">Load failed: {error}</p>
        </div>
      )}

      {data.metar && (
        <div className="dashboard-root" data-dashboard-mode={dashboardMode}>
          {/* Row 1 left: Header */}
          <div className="left-panel-header">
            <Header
              airports={airportOptions}
              selectedAirport={selectedAirport}
              onAirportChange={setSelectedAirport}
              airportLabel={airportLabel}
            />
          </div>

          {/* Row 1 right: Settings icon */}
          <div className="right-panel-top">
            <button
              className="settings-icon-btn"
              onClick={() => setShowSettings(true)}
              title="설정"
              aria-label="설정"
            >
              &#8943;
            </button>
          </div>

          {/* Row 2 left: Warning + Metrics + TAF */}
          <div className="left-panel-body">
            <WarningList
              warningData={data.warning}
              groundOverviewData={data.groundOverview}
              icao={selectedAirport}
              warningTypes={data.warningTypes}
              dashboardMode={dashboardMode}
              tz={timeZone}
            />

            <MetarCard
              metarData={data.metar}
              amosData={data.amos}
              icao={selectedAirport}
              minimaSettings={airportMinimaSettings}
              airportMeta={selectedAirportMeta}
              metarTime={metarTime}
              version={metarVersion}
              tz={timeZone}
            />

            {dashboardMode === "ground" ? (
              <GroundForecastPanel
                groundForecastData={data.groundForecast}
                icao={selectedAirport}
              />
            ) : (
              <TafTimeline
                tafData={data.taf}
                icao={selectedAirport}
                minimaSettings={airportMinimaSettings}
                version={tafVersion}
                onVersionToggle={setTafVersion}
                tz={timeZone}
              />
            )}
          </div>

          {/* Row 2 right: Map panel */}
          <div className="map-panel-wrap">
            <div className="map-panel-title">기상 레이더</div>
              <InteractiveMap
                lightningData={data.lightning}
                sigwxLowData={data.sigwxLow}
                sigwxLowHistoryData={data.sigwxLowHistory}
                sigwxLowFrontsData={data.sigwxLowFronts}
                sigwxLowCloudsData={data.sigwxLowClouds}
                sigmetData={data.sigmet}
                airmetData={data.airmet}
                adsbData={data.adsb}
              selectedAirport={selectedAirport}
              airports={data.airports}
              windDir={(() => {
                const w = data.metar?.airports?.[selectedAirport]?.observation?.wind;
                if (!w || w.calm || w.variable) return null;
                return w.direction;
              })()}
              echoMeta={data.echoMeta}
              satMeta={data.satMeta}
              radarOpacity={radarOpacity}
              mapTheme={mapTheme}
              tz={timeZone}
              trafficCallsignFilter={trafficCallsignFilter}
              trafficAltitudeBands={trafficAltitudeBands}
            />
          </div>
        </div>
      )}

      {showSettings && alertDefaults && (
        <Settings
          defaults={alertDefaults}
          onClose={() => setShowSettings(false)}
          onSettingsChange={handleSettingsChange}
          timeZone={timeZone}
          setTimeZone={setTimeZone}
          mapTheme={mapTheme}
          setMapTheme={setMapTheme}
          trafficCallsignFilter={trafficCallsignFilter}
          setTrafficCallsignFilter={setTrafficCallsignFilter}
          trafficAltitudeBands={trafficAltitudeBands}
          setTrafficAltitudeBands={setTrafficAltitudeBands}
          minimaSettings={airportMinimaSettings}
          setMinimaSettings={setAirportMinimaSettings}
        />
      )}
    </>
  );
}

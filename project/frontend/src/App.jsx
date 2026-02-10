import { useState, useEffect, useCallback } from "react";
import { loadAllData } from "./utils/api";
import Header from "./components/Header";
import SummaryGrid from "./components/SummaryGrid";
import StatusPanel from "./components/StatusPanel";
import Controls from "./components/Controls";
import MetarCard from "./components/MetarCard";
import WarningList from "./components/WarningList";
import TafTimeline from "./components/TafTimeline";
import "./App.css";

export default function App() {
  const [data, setData] = useState({});
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadAllData();
      setData(result);

      setSelectedAirport((prev) => {
        const metarAirports = Object.keys(result.metar?.airports || {});
        if (prev && metarAirports.includes(prev)) return prev;
        return metarAirports[0] || null;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const airportList = Object.keys(data.metar?.airports || {});
  if (airportList.length === 0 && data.airports) {
    airportList.push(...data.airports.map((a) => a.icao));
  }

  const lastUpdated = [data.metar?.fetched_at, data.taf?.fetched_at, data.warning?.fetched_at]
    .filter(Boolean)
    .sort()
    .pop() || null;

  return (
    <>
      <div className="bg-shape shape-a" />
      <div className="bg-shape shape-b" />

      <main className="container">
        <Header lastUpdated={lastUpdated} />

        {loading && !data.metar && (
          <p className="loading-message">Loading data...</p>
        )}

        {error && (
          <p className="error-message">Load failed: {error}</p>
        )}

        {data.metar && (
          <>
            <SummaryGrid metar={data.metar} taf={data.taf} warning={data.warning} />
            <StatusPanel status={data.status} />
            <Controls
              airports={airportList}
              selectedAirport={selectedAirport}
              onAirportChange={setSelectedAirport}
              onRefresh={loadAll}
            />
            <section className="split">
              <MetarCard metarData={data.metar} icao={selectedAirport} />
              <WarningList
                warningData={data.warning}
                icao={selectedAirport}
                warningTypes={data.warningTypes}
              />
            </section>
            <TafTimeline tafData={data.taf} icao={selectedAirport} />
          </>
        )}
      </main>
    </>
  );
}

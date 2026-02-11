import { useEffect, useMemo, useState } from "react";

const BASE_WIDTH = 646;
const BASE_HEIGHT = 631;
const FRAME_MS = 500;

const AIRPORT_PIXELS = {
  RKSI: { x: 285, y: 207 },
  RKSS: { x: 304, y: 200 },
  RKNY: { x: 398, y: 167 },
  RKPU: { x: 440, y: 323 },
  RKPK: { x: 419, y: 353 },
  RKJB: { x: 284, y: 367 },
  RKJY: { x: 348, y: 376 },
  RKPC: { x: 292, y: 463 },
};

function toCssPosition(icao) {
  const point = AIRPORT_PIXELS[icao];
  if (!point) return null;
  return {
    left: `${(point.x / BASE_WIDTH) * 100}%`,
    top: `${(point.y / BASE_HEIGHT) * 100}%`,
  };
}

export default function RadarPanel({ radarData, selectedAirport }) {
  const images = useMemo(() => radarData?.images || [], [radarData]);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return undefined;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % images.length);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [images.length]);

  const current = images[frameIndex] || null;
  const markerPos = toCssPosition(selectedAirport);

  return (
    <section className="panel radar-panel">
      <div className="radar-head">
        <h3>Radar</h3>
        <p className="sub">
          {current?.tm ? `Frame ${frameIndex + 1}/${images.length} (${current.tm})` : "No frame"}
        </p>
      </div>

      {!current?.path ? (
        <p className="sub">Radar data unavailable.</p>
      ) : (
        <div className="radar-wrap" aria-label={`Radar image for ${selectedAirport || "airport"}`}>
          <img className="radar-img" src={current.path} alt="KMA radar precipitation" loading="lazy" />
          {markerPos && (
            <div className="airport-marker" style={markerPos} title={selectedAirport}>
              <span>+</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

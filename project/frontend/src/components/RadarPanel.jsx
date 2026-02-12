import { useEffect, useMemo, useState } from "react";

const BASE_WIDTH = 646;
const BASE_HEIGHT = 631;
const DEFAULT_FRAME_MS = 500;
const MIN_FRAME_MS = 100;
const MAX_FRAME_MS = 2000;
const FRAME_MS_STEP = 100;

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

function formatTmLabel(tm) {
  if (!tm || !/^\d{12}$/.test(tm)) return "-";
  const hour = tm.slice(8, 10);
  const minute = tm.slice(10, 12);
  return `${hour}:${minute}`;
}

export default function RadarPanel({ radarData, selectedAirport }) {
  const images = useMemo(() => radarData?.images || [], [radarData]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackMs, setPlaybackMs] = useState(DEFAULT_FRAME_MS);

  const current = images[frameIndex] || null;

  useEffect(() => {
    if (!images.length) {
      setFrameIndex(0);
      return;
    }

    if (isPlaying) {
      setFrameIndex((prev) => prev % images.length);
      return;
    }

    // Paused mode always follows latest frame.
    setFrameIndex(images.length - 1);
  }, [images, isPlaying]);

  useEffect(() => {
    if (!isPlaying || images.length <= 1) return undefined;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % images.length);
    }, playbackMs);
    return () => clearInterval(timer);
  }, [images.length, isPlaying, playbackMs]);

  const markerPos = toCssPosition(selectedAirport);
  const maxIndex = Math.max(images.length - 1, 0);
  const progressRatio = maxIndex > 0 ? (frameIndex / maxIndex) : 0;
  const canDecrementSpeed = playbackMs > MIN_FRAME_MS;
  const canIncrementSpeed = playbackMs < MAX_FRAME_MS;

  function changePlaybackSpeed(delta) {
    setPlaybackMs((prev) => {
      const next = prev + delta;
      return Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, next));
    });
  }

  return (
    <section className="panel radar-panel">
      <div className="radar-head">
        <h3>Radar</h3>
        <div className="radar-speed-control">
          <button
            type="button"
            className="radar-speed-step"
            onClick={() => changePlaybackSpeed(-FRAME_MS_STEP)}
            disabled={!canDecrementSpeed}
            aria-label="재생시간 감소"
            title="재생시간 감소"
          >
            -
          </button>
          <span className="radar-speed-chip">재생시간 {(playbackMs / 1000).toFixed(1)}초</span>
          <button
            type="button"
            className="radar-speed-step"
            onClick={() => changePlaybackSpeed(FRAME_MS_STEP)}
            disabled={!canIncrementSpeed}
            aria-label="재생시간 증가"
            title="재생시간 증가"
          >
            +
          </button>
        </div>
      </div>

      {!current?.path ? (
        <p className="sub">Radar data unavailable.</p>
      ) : (
        <>
          <div className="radar-wrap" aria-label={`Radar image for ${selectedAirport || "airport"}`}>
            <img className="radar-img" src={current.path} alt="KMA radar precipitation" loading="lazy" />
            {markerPos && (
              <div className="airport-marker" style={markerPos} title={selectedAirport}>
                <span>+</span>
              </div>
            )}
          </div>
          <div className="radar-timeline">
            <div className="radar-seek-wrap">
              <button
                type="button"
                className="radar-icon-btn radar-icon-inline"
                onClick={() => setIsPlaying((prev) => !prev)}
                disabled={images.length <= 1}
                aria-label={isPlaying ? "Pause radar playback" : "Play radar playback"}
                title={isPlaying ? "일시정지" : "재생"}
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <input
                className="radar-seek"
                type="range"
                min={0}
                max={maxIndex}
                step={1}
                value={Math.min(frameIndex, maxIndex)}
                onChange={(event) => setFrameIndex(Number(event.target.value))}
                aria-label="Radar timeline"
              />
              <div className="radar-time-row">
                <span
                  className="radar-current-time"
                  style={{ "--radar-progress": progressRatio }}
                >
                  {formatTmLabel(current?.tm)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

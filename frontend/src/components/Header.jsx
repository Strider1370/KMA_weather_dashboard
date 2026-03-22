import { useState, useRef, useEffect } from "react";

export default function Header({
  airports = [],
  selectedAirport,
  onAirportChange,
  metarTime,
  flightCategory,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const cat = flightCategory || { category: "VFR", color: "#15803d" };

  return (
    <header className="new-header">
      <div className="new-header-left">
        <div className="airport-dropdown" ref={ref}>
          <button
            className="airport-dropdown-btn"
            onClick={() => setOpen((p) => !p)}
          >
            <span className="airport-dropdown-icao">{selectedAirport || "----"}</span>
            <span className="airport-dropdown-caret">&#9660;</span>
          </button>
          {open && (
            <ul className="airport-dropdown-list">
              {airports.map((icao) => (
                <li
                  key={icao}
                  className={icao === selectedAirport ? "active" : ""}
                  onClick={() => {
                    onAirportChange?.(icao);
                    setOpen(false);
                  }}
                >
                  {icao}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="new-header-time">{metarTime || ""}</span>
      </div>
      <div
        className="flight-cat-badge"
        style={{ background: cat.color }}
      >
        {cat.category}
      </div>
    </header>
  );
}

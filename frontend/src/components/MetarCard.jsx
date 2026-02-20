import { safe, formatUtc, getSeverityLevel } from "../utils/helpers";
import WeatherIcon, { WindBarb } from "./WeatherIcon";
import { resolveIconKey, resolveWindBarb, convertWeatherToKorean } from "../utils/visual-mapper";

export default function MetarCard({ metarData, icao, version = "v1", onVersionToggle, tz = "UTC" }) {
  const target = metarData?.airports?.[icao];

  if (!target) {
    return (
      <article className="panel">
        <h3>METAR/SPECI</h3>
        <pre className="mono">No METAR data for selected airport.</pre>
      </article>
    );
  }

  const windSpeed = target.observation?.wind?.speed;
  const windGust = target.observation?.wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const level = getSeverityLevel({ visibility, wind: windSpeed, gust: windGust });
  const issueTime = target.header?.issue_time || target.header?.observation_time;

  if (version === "v2") {
    const iconKey = resolveIconKey(target.observation, issueTime);
    const barb = resolveWindBarb(target.observation?.wind);
    const weatherKorean = convertWeatherToKorean(target.observation?.display?.weather, target.observation?.cavok);
    
    // display.temperature (예: "05/M07")에서 M을 -로 변경
    const tempDisplay = (target.observation?.display?.temperature || "").replaceAll('M', '-');

    return (
      <article className="metar-v2 panel">
        <div className="metar-v2-header">
          <div className="metar-v2-icao">{icao}</div>
          <div className="metar-v2-time">{formatUtc(issueTime, tz)} METAR</div>
        </div>

        <div className="metar-v2-main">
          <div className="metar-v2-icon-box">
            <WeatherIcon iconKey={iconKey} />
            <div className="metar-v2-phenomena">{weatherKorean}</div>
          </div>
          
          <div className="metar-v2-wind-side">
            <div className="wind-arrow-box-v2">
              <div 
                className="wind-arrow-v2" 
                style={{ transform: `rotate(${barb.rotation + 180}deg)` }}
              >
                ↑
              </div>
            </div>
            <div className="metar-v2-wind-value-v2">{windSpeed}kt</div>
          </div>
        </div>

        <div className="metar-v2-grid">
          <div className="metar-v2-item">
            <div className="metar-v2-label">운저고도</div>
            <div className="metar-v2-value">{target.observation?.clouds?.[0]?.base || "-"}ft</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">시정</div>
            <div className="metar-v2-value">{target.observation?.display?.visibility}</div>
          </div>
          <div className="metar-v2-item">
            <div className="metar-v2-label">기온/이슬점</div>
            <div className="metar-v2-value">{tempDisplay || "-"}</div>
          </div>
        </div>
        
        <button 
          className="dashboard-toggle-btn" 
          onClick={() => onVersionToggle?.("v1")}
          style={{ marginTop: 'auto' }}
        >
          텍스트 모드 보기
        </button>
      </article>
    );
  }

  const lines = [
    `Report Type: ${safe(target.header?.report_type || metarData?.type || "METAR")}`,
    `Issue Time: ${safe(formatUtc(issueTime, tz))}`,
    `Wind: ${safe(target.observation?.display?.wind)}`,
    `Visibility: ${safe(target.observation?.display?.visibility)}`,
    `Weather: ${safe(target.observation?.display?.weather)}`,
    `Clouds: ${safe(target.observation?.display?.clouds)}`,
    `Temp: ${safe(target.observation?.display?.temperature)}`,
    `QNH: ${safe(target.observation?.display?.qnh)}`,
  ];

  return (
    <article className="panel metar-panel-v1">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>METAR/SPECI</h3>
        <button className="dashboard-toggle-btn" onClick={() => onVersionToggle?.("v2")}>
          사이드바 모드
        </button>
      </div>
      <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
    </article>
  );
}

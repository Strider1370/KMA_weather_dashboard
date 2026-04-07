import { useState } from "react";
import {
  resolveSettings,
  savePersonalSettings,
  clearPersonalSettings,
} from "../../utils/alerts";
import {
  DEFAULT_AIRPORT_MINIMA_RULES,
  normalizeAirportMinimaSettings,
} from "../../utils/helpers";
import {
  SIGMET_FILTER_GROUPS,
  AIRMET_FILTER_GROUPS,
  SIGWX_FILTER_GROUPS,
  getDefaultAdvisoryFilterSettings,
  saveAdvisoryFilterSettings,
} from "../../utils/advisory-filter";

const TRIGGER_LABELS = {
  warning_issued: "경보 발령",
  warning_cleared: "경보 해제",
  low_visibility: "저시정",
  high_wind: "강풍",
  weather_phenomenon: "특이기상 (TS/SN/FG)",
  low_ceiling: "저운고",
  taf_adverse_weather: "TAF 악기상",
  lightning_detected: "낙뢰 탐지",
};

const TRAFFIC_ALTITUDE_OPTIONS = [
  "0-10000",
  "10000-20000",
  "20000-30000",
  "30000-40000",
  "40000-50000",
];

const MINIMA_AIRPORT_ORDER = ["RKSI", "RKSS", "RKPC", "RKPK", "RKJY", "RKJB", "RKPU", "RKNY"];

const SIGMET_FILTER_LABELS = {
  thunderstorm:     "뇌우",
  turbulence:       "난류",
  icing:            "착빙",
  hail:             "우박",
  tropical_cyclone: "열대저기압",
  volcanic_ash:     "화산재",
  duststorm:        "황사/모래폭풍",
};

const AIRMET_FILTER_LABELS = {
  turbulence:           "난류",
  icing:                "착빙",
  sfc_wind:             "지상강풍",
  sfc_vis:              "지상시정",
  llws:                 "저고도윈드시어",
  mountain_obscuration: "산악차폐",
};

const SIGWX_FILTER_LABELS = {
  cloud:                "구름/CB",
  turbulence:           "난류",
  icing_area:           "착빙구역",
  freezing_level:       "빙결고도",
  sfc_wind:             "지상바람",
  sfc_vis:              "지상시정",
  mountain_obscuration: "산악차폐",
  pressure:             "저/고기압",
  front_line:           "전선",
  jet_stream:           "제트기류",
};

export default function Settings({
  defaults,
  onClose,
  onSettingsChange,
  timeZone,
  setTimeZone,
  mapTheme,
  setMapTheme,
  trafficCallsignFilter,
  setTrafficCallsignFilter,
  trafficAltitudeBands,
  setTrafficAltitudeBands,
  minimaSettings,
  setMinimaSettings,
  advisoryFilter,
  setAdvisoryFilter,
}) {
  const current = resolveSettings(defaults);

  const [globalEnabled, setGlobalEnabled] = useState(current.global.alerts_enabled);
  const [cooldown, setCooldown] = useState(current.global.cooldown_seconds);
  const [pollInterval, setPollInterval] = useState(current.global.poll_interval_seconds);
  const [quietStart, setQuietStart] = useState(current.global.quiet_hours?.start || "");
  const [quietEnd, setQuietEnd] = useState(current.global.quiet_hours?.end || "");

  const [popupEnabled, setPopupEnabled] = useState(current.dispatchers.popup.enabled);
  const [autoDismiss, setAutoDismiss] = useState(current.dispatchers.popup.auto_dismiss_seconds);
  const [soundEnabled, setSoundEnabled] = useState(current.dispatchers.sound.enabled);
  const [volume, setVolume] = useState(current.dispatchers.sound.volume);
  const [marqueeEnabled, setMarqueeEnabled] = useState(current.dispatchers.marquee.enabled);

  const [localTimeZone, setLocalTimeZone] = useState(timeZone || "KST");
  const [localMapTheme, setLocalMapTheme] = useState(mapTheme || localStorage.getItem("map_theme") || "light");
  const [localTrafficCallsignFilter, setLocalTrafficCallsignFilter] = useState(trafficCallsignFilter || "");
  const [localTrafficAltitudeBands, setLocalTrafficAltitudeBands] = useState(trafficAltitudeBands || []);
  const [localMinimaSettings, setLocalMinimaSettings] = useState(
    normalizeAirportMinimaSettings(minimaSettings || DEFAULT_AIRPORT_MINIMA_RULES)
  );
  const [localAdvisoryFilter, setLocalAdvisoryFilter] = useState(
    advisoryFilter || getDefaultAdvisoryFilterSettings()
  );
  const [activeTab, setActiveTab] = useState("general");

  const [triggers, setTriggers] = useState(() => {
    const nextTriggers = {};
    for (const [id, cfg] of Object.entries(current.triggers)) {
      nextTriggers[id] = { enabled: cfg.enabled, params: { ...cfg.params } };
    }
    return nextTriggers;
  });

  function toggleTrigger(id) {
    setTriggers((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id].enabled },
    }));
  }

  function updateTriggerParam(id, key, value) {
    setTriggers((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        params: { ...prev[id].params, [key]: value },
      },
    }));
  }

  function toggleTrafficAltitudeBand(band) {
    setLocalTrafficAltitudeBands((prev) => (
      prev.includes(band)
        ? prev.filter((item) => item !== band)
        : [...prev, band]
    ));
  }

  function toggleAdvisoryChip(section, key) {
    setLocalAdvisoryFilter((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: !prev[section][key] },
    }));
  }

  function setAllAdvisorySection(section, value) {
    setLocalAdvisoryFilter((prev) => ({
      ...prev,
      [section]: Object.fromEntries(Object.keys(prev[section]).map((k) => [k, value])),
    }));
  }

  function updateMinimaValue(icao, key, value) {
    setLocalMinimaSettings((prev) => ({
      ...prev,
      [icao]: {
        ...prev[icao],
        [key]: value === "" ? null : Number(value),
      },
    }));
  }

  function applySettings() {
    const overrides = {
      global: {
        alerts_enabled: globalEnabled,
        cooldown_seconds: Number(cooldown),
        poll_interval_seconds: Number(pollInterval),
        quiet_hours: quietStart && quietEnd ? { start: quietStart, end: quietEnd } : null,
      },
      dispatchers: {
        popup: { enabled: popupEnabled, auto_dismiss_seconds: Number(autoDismiss) },
        sound: { enabled: soundEnabled, volume: Number(volume) },
        marquee: { enabled: marqueeEnabled },
      },
      triggers,
    };

    savePersonalSettings(overrides);
    localStorage.setItem("time_zone", localTimeZone);
    localStorage.setItem("map_theme", localMapTheme);
    localStorage.setItem("traffic_callsign_filter", localTrafficCallsignFilter);
    localStorage.setItem("traffic_altitude_bands", JSON.stringify(localTrafficAltitudeBands));
    localStorage.setItem("airport_minima_settings", JSON.stringify(localMinimaSettings));
    saveAdvisoryFilterSettings(localAdvisoryFilter);

    setTimeZone?.(localTimeZone);
    setMapTheme?.(localMapTheme);
    setTrafficCallsignFilter?.(localTrafficCallsignFilter);
    setTrafficAltitudeBands?.(localTrafficAltitudeBands);
    setMinimaSettings?.(normalizeAirportMinimaSettings(localMinimaSettings));
    setAdvisoryFilter?.(localAdvisoryFilter);

    onSettingsChange?.(overrides);
  }

  function handleApply() {
    applySettings();
  }

  function handleSave() {
    applySettings();
    onClose();
  }

  function handleReset() {
    clearPersonalSettings();
    localStorage.removeItem("time_zone");
    localStorage.removeItem("map_theme");
    localStorage.removeItem("traffic_callsign_filter");
    localStorage.removeItem("traffic_altitude_bands");
    localStorage.removeItem("airport_minima_settings");
    localStorage.removeItem("advisory_filter_settings");

    setTimeZone?.("KST");
    setMapTheme?.("light");
    setTrafficCallsignFilter?.("");
    setTrafficAltitudeBands?.([]);
    setMinimaSettings?.(normalizeAirportMinimaSettings(DEFAULT_AIRPORT_MINIMA_RULES));
    setAdvisoryFilter?.(getDefaultAdvisoryFilterSettings());

    onSettingsChange?.(null);
    onClose();
  }

  return (
    <div className="alert-settings-overlay" onClick={onClose}>
      <div className="alert-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="alert-settings-header">
          <h2>설정</h2>
          <button className="alert-popup-close" onClick={onClose}>&times;</button>
        </div>

        <div className="alert-settings-layout">
          <div className="alert-settings-tabs">
            <button
              className={`alert-settings-tab-btn${activeTab === "general" ? " active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              일반
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "alert" ? " active" : ""}`}
              onClick={() => setActiveTab("alert")}
            >
              알림
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "traffic" ? " active" : ""}`}
              onClick={() => setActiveTab("traffic")}
            >
              항적
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "minima" ? " active" : ""}`}
              onClick={() => setActiveTab("minima")}
            >
              LIFR
            </button>
            <button
              className={`alert-settings-tab-btn${activeTab === "advisory" ? " active" : ""}`}
              onClick={() => setActiveTab("advisory")}
            >
              공역예보
            </button>
          </div>

          <div className="alert-settings-body">
            {activeTab === "general" && (
              <fieldset className="alert-settings-section">
                <legend>표시 설정</legend>
                <label className="alert-settings-row">
                  <span>시간대</span>
                  <select value={localTimeZone} onChange={(e) => setLocalTimeZone(e.target.value)}>
                    <option value="UTC">UTC</option>
                    <option value="KST">KST (UTC+9)</option>
                  </select>
                </label>
                <label className="alert-settings-row">
                  <span>사이트 테마</span>
                  <select value={localMapTheme} onChange={(e) => setLocalMapTheme(e.target.value)}>
                    <option value="light">라이트</option>
                    <option value="dark">다크</option>
                  </select>
                </label>
              </fieldset>
            )}

            {activeTab === "alert" && (
              <>
                <fieldset className="alert-settings-section">
                  <legend>전역 설정</legend>
                  <label className="alert-settings-row">
                    <span>알림 사용</span>
                    <input type="checkbox" checked={globalEnabled} onChange={(e) => setGlobalEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>쿨다운(초)</span>
                    <input type="number" min={0} max={3600} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>야간 시작</span>
                    <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>야간 종료</span>
                    <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                  </label>
                </fieldset>

                <fieldset className="alert-settings-section">
                  <legend>전달 채널</legend>
                  <label className="alert-settings-row">
                    <span>팝업</span>
                    <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>자동 닫힘(초)</span>
                    <input type="number" min={0} max={60} value={autoDismiss} onChange={(e) => setAutoDismiss(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>사운드</span>
                    <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>볼륨 ({volume}%)</span>
                    <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                  </label>
                  <label className="alert-settings-row">
                    <span>마키</span>
                    <input type="checkbox" checked={marqueeEnabled} onChange={(e) => setMarqueeEnabled(e.target.checked)} />
                  </label>
                </fieldset>

                <fieldset className="alert-settings-section">
                  <legend>트리거 설정</legend>
                  {Object.entries(triggers).map(([id, cfg]) => (
                    <div key={id} className="alert-settings-trigger">
                      <label className="alert-settings-row">
                        <span>{TRIGGER_LABELS[id] || id}</span>
                        <input type="checkbox" checked={cfg.enabled} onChange={() => toggleTrigger(id)} />
                      </label>
                      {cfg.enabled && id === "low_visibility" && (
                        <label className="alert-settings-row alert-settings-sub">
                          <span>시정 임계치(m)</span>
                          <input
                            type="number"
                            min={100}
                            max={10000}
                            step={100}
                            value={cfg.params.threshold}
                            onChange={(e) => updateTriggerParam(id, "threshold", Number(e.target.value))}
                          />
                        </label>
                      )}
                      {cfg.enabled && id === "high_wind" && (
                        <>
                          <label className="alert-settings-row alert-settings-sub">
                            <span>풍속 임계치(kt)</span>
                            <input
                              type="number"
                              min={10}
                              max={100}
                              value={cfg.params.speed_threshold}
                              onChange={(e) => updateTriggerParam(id, "speed_threshold", Number(e.target.value))}
                            />
                          </label>
                          <label className="alert-settings-row alert-settings-sub">
                            <span>돌풍 임계치(kt)</span>
                            <input
                              type="number"
                              min={10}
                              max={100}
                              value={cfg.params.gust_threshold}
                              onChange={(e) => updateTriggerParam(id, "gust_threshold", Number(e.target.value))}
                            />
                          </label>
                        </>
                      )}
                      {cfg.enabled && id === "low_ceiling" && (
                        <label className="alert-settings-row alert-settings-sub">
                          <span>운고 임계치(ft)</span>
                          <input
                            type="number"
                            min={100}
                            max={5000}
                            step={100}
                            value={cfg.params.threshold}
                            onChange={(e) => updateTriggerParam(id, "threshold", Number(e.target.value))}
                          />
                        </label>
                      )}
                      {cfg.enabled && id === "taf_adverse_weather" && (
                        <label className="alert-settings-row alert-settings-sub">
                          <span>TAF 시정 임계치(m)</span>
                          <input
                            type="number"
                            min={500}
                            max={10000}
                            step={500}
                            value={cfg.params.vis_threshold}
                            onChange={(e) => updateTriggerParam(id, "vis_threshold", Number(e.target.value))}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </fieldset>
              </>
            )}

            {activeTab === "traffic" && (
              <fieldset className="alert-settings-section">
                <legend>TRAFFIC 필터</legend>
                <label className="alert-settings-row">
                  <span>호출부호 필터</span>
                  <input
                    type="text"
                    value={localTrafficCallsignFilter}
                    onChange={(e) => setLocalTrafficCallsignFilter(e.target.value.toUpperCase())}
                    placeholder="예: KAL, AAR123, JJA"
                  />
                </label>
                <fieldset className="alert-settings-section">
                  <legend>고도 필터(ft)</legend>
                  {TRAFFIC_ALTITUDE_OPTIONS.map((band) => (
                    <label key={band} className="alert-settings-row">
                      <span>{band}</span>
                      <input
                        type="checkbox"
                        checked={localTrafficAltitudeBands.includes(band)}
                        onChange={() => toggleTrafficAltitudeBand(band)}
                      />
                    </label>
                  ))}
                </fieldset>
              </fieldset>
            )}

            {activeTab === "minima" && (
              <fieldset className="alert-settings-section">
                <legend>공항별 LIFR(MINIMA) 기준</legend>
                <div className="minima-grid">
                  {MINIMA_AIRPORT_ORDER.map((icao) => {
                    const rule = localMinimaSettings[icao] || { visibilityM: null, ceilingFt: null };
                    const noDhAirport = icao === "RKSI" || icao === "RKSS";
                    return (
                      <div key={icao} className="minima-card">
                        <div className="minima-card-head">{icao}</div>
                        <label className="minima-card-row">
                          <span>시정(m)</span>
                          <input
                            type="number"
                            min={50}
                            max={5000}
                            step={25}
                            value={rule.visibilityM ?? ""}
                            onChange={(e) => updateMinimaValue(icao, "visibilityM", e.target.value)}
                          />
                        </label>
                        <label className="minima-card-row">
                          <span>운고(ft)</span>
                          <input
                            type="number"
                            min={50}
                            max={1000}
                            step={10}
                            value={rule.ceilingFt ?? ""}
                            onChange={(e) => updateMinimaValue(icao, "ceilingFt", e.target.value)}
                            placeholder={noDhAirport ? "NO DH(기본값)" : ""}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {activeTab === "advisory" && (
              <div className="advisory-filter-tab">
                {[
                  { section: "sigmet", label: "SIGMET", groups: SIGMET_FILTER_GROUPS, labelMap: SIGMET_FILTER_LABELS },
                  { section: "airmet", label: "AIRMET", groups: AIRMET_FILTER_GROUPS, labelMap: AIRMET_FILTER_LABELS },
                  { section: "sigwx",  label: "SIGWX",  groups: SIGWX_FILTER_GROUPS,  labelMap: SIGWX_FILTER_LABELS  },
                ].map(({ section, label, groups, labelMap }) => {
                  const allOn = Object.keys(groups).every((k) => localAdvisoryFilter[section][k] !== false);
                  return (
                    <fieldset key={section} className="alert-settings-section advisory-filter-section">
                      <legend className="advisory-filter-legend">
                        <span>{label}</span>
                        <button
                          type="button"
                          className="advisory-filter-toggle-all"
                          onClick={() => setAllAdvisorySection(section, !allOn)}
                        >
                          {allOn ? "전체 해제" : "전체 선택"}
                        </button>
                      </legend>
                      <div className="advisory-filter-chips">
                        {Object.keys(groups).map((key) => {
                          const on = localAdvisoryFilter[section][key] !== false;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`advisory-filter-chip${on ? " active" : ""}`}
                              onClick={() => toggleAdvisoryChip(section, key)}
                            >
                              {labelMap[key] || key}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="alert-settings-footer">
          <button className="btn-reset" onClick={handleReset}>초기화</button>
          <button className="btn-apply" onClick={handleApply}>적용</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  resolveSettings,
  savePersonalSettings,
  clearPersonalSettings,
  loadPersonalSettings,
} from "../../utils/alerts";

const TRIGGER_LABELS = {
  warning_issued: "기상특보 발표",
  warning_cleared: "기상특보 해제",
  low_visibility: "저시정",
  high_wind: "강풍",
  weather_phenomenon: "기상현상 (TS/SN 등)",
  low_ceiling: "저운고",
  taf_adverse_weather: "TAF 악기상 예보",
  lightning_detected: "낙뢰 감지",
};

export default function Settings({ defaults, onClose, onSettingsChange, timeZone, setTimeZone }) {
  const current = resolveSettings(defaults);
  const personal = loadPersonalSettings() || {};

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

  // UI Version states (local to settings modal)
  const [metarVersion, setMetarVersion] = useState(() => localStorage.getItem("metar_version") || "v1");
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem("taf_version") || "v1");
  const [lightningBoundary, setLightningBoundary] = useState(() => localStorage.getItem("lightning_boundary") || "sigungu");
  const [localTimeZone, setLocalTimeZone] = useState(timeZone || "KST");
  const [activeTab, setActiveTab] = useState("general");

  const [triggers, setTriggers] = useState(() => {
    const t = {};
    for (const [id, cfg] of Object.entries(current.triggers)) {
      t[id] = { enabled: cfg.enabled, params: { ...cfg.params } };
    }
    return t;
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

  function handleSave() {
    const overrides = {
      global: {
        alerts_enabled: globalEnabled,
        cooldown_seconds: Number(cooldown),
        poll_interval_seconds: Number(pollInterval),
        quiet_hours:
          quietStart && quietEnd ? { start: quietStart, end: quietEnd } : null,
      },
      dispatchers: {
        popup: { enabled: popupEnabled, auto_dismiss_seconds: Number(autoDismiss) },
        sound: { enabled: soundEnabled, volume: Number(volume) },
        marquee: { enabled: marqueeEnabled },
      },
      triggers,
    };
    savePersonalSettings(overrides);
    
    // Save UI versions to localStorage
    localStorage.setItem("metar_version", metarVersion);
    localStorage.setItem("taf_version", tafVersion);
    localStorage.setItem("lightning_boundary", lightningBoundary);
    localStorage.setItem("time_zone", localTimeZone);
    setTimeZone?.(localTimeZone);
    
    onSettingsChange?.(overrides);
    onClose();
  }

  function handleReset() {
    clearPersonalSettings();
    localStorage.removeItem("metar_version");
    localStorage.removeItem("taf_version");
    localStorage.removeItem("lightning_boundary");
    localStorage.removeItem("time_zone");
    setTimeZone?.("KST");
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
          {/* 좌측 탭 사이드바 */}
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
              알람
            </button>
          </div>

          {/* 우측 콘텐츠 */}
          <div className="alert-settings-body">
            {activeTab === "general" && (
              <fieldset className="alert-settings-section">
                <legend>디스플레이 설정</legend>
                <label className="alert-settings-row">
                  <span>METAR 표시 모드</span>
                  <select value={metarVersion} onChange={(e) => setMetarVersion(e.target.value)}>
                    <option value="v1">텍스트 리스트 (기본)</option>
                    <option value="v2">사이드바 요약 (시각화)</option>
                  </select>
                </label>
                <label className="alert-settings-row">
                  <span>TAF 표시 모드</span>
                  <select value={tafVersion} onChange={(e) => setTafVersion(e.target.value)}>
                    <option value="v1">상세 테이블 (기본)</option>
                    <option value="v2">심각도 타임라인 (컬러 바)</option>
                    <option value="v3">시간별 상세 그리드 (아이콘)</option>
                  </select>
                </label>
                <label className="alert-settings-row">
                  <span>낙뢰 지도 경계</span>
                  <select value={lightningBoundary} onChange={(e) => setLightningBoundary(e.target.value)}>
                    <option value="sigungu">시군구 (기본)</option>
                    <option value="admdong">행정동 (상세)</option>
                  </select>
                </label>
                <label className="alert-settings-row">
                  <span>시간대 표시</span>
                  <select value={localTimeZone} onChange={(e) => setLocalTimeZone(e.target.value)}>
                    <option value="UTC">UTC (협정 세계시)</option>
                    <option value="KST">KST (한국 표준시, UTC+9)</option>
                  </select>
                </label>
              </fieldset>
            )}

            {activeTab === "alert" && (
              <>
                <fieldset className="alert-settings-section">
                  <legend>전체 설정</legend>
                  <label className="alert-settings-row">
                    <span>알림 활성화</span>
                    <input type="checkbox" checked={globalEnabled} onChange={(e) => setGlobalEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>폴링 간격 (초)</span>
                    <input type="number" min={10} max={300} value={pollInterval} onChange={(e) => setPollInterval(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>쿨다운 (초)</span>
                    <input type="number" min={0} max={3600} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>조용 시간 시작</span>
                    <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>조용 시간 종료</span>
                    <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                  </label>
                </fieldset>

                <fieldset className="alert-settings-section">
                  <legend>알림 방식</legend>
                  <label className="alert-settings-row">
                    <span>팝업 알림</span>
                    <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>자동 닫기 (초)</span>
                    <input type="number" min={0} max={60} value={autoDismiss} onChange={(e) => setAutoDismiss(e.target.value)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>사운드 알림</span>
                    <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
                  </label>
                  <label className="alert-settings-row">
                    <span>볼륨 ({volume}%)</span>
                    <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                  </label>
                  <label className="alert-settings-row">
                    <span>마퀴 (하단 바)</span>
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
                          <span>시정 임계값 (m)</span>
                          <input type="number" min={100} max={10000} step={100} value={cfg.params.threshold}
                            onChange={(e) => updateTriggerParam(id, "threshold", Number(e.target.value))} />
                        </label>
                      )}
                      {cfg.enabled && id === "high_wind" && (
                        <>
                          <label className="alert-settings-row alert-settings-sub">
                            <span>풍속 임계값 (kt)</span>
                            <input type="number" min={10} max={100} value={cfg.params.speed_threshold}
                              onChange={(e) => updateTriggerParam(id, "speed_threshold", Number(e.target.value))} />
                          </label>
                          <label className="alert-settings-row alert-settings-sub">
                            <span>돌풍 임계값 (kt)</span>
                            <input type="number" min={10} max={100} value={cfg.params.gust_threshold}
                              onChange={(e) => updateTriggerParam(id, "gust_threshold", Number(e.target.value))} />
                          </label>
                        </>
                      )}
                      {cfg.enabled && id === "low_ceiling" && (
                        <label className="alert-settings-row alert-settings-sub">
                          <span>운고 임계값 (ft)</span>
                          <input type="number" min={100} max={5000} step={100} value={cfg.params.threshold}
                            onChange={(e) => updateTriggerParam(id, "threshold", Number(e.target.value))} />
                        </label>
                      )}
                      {cfg.enabled && id === "taf_adverse_weather" && (
                        <label className="alert-settings-row alert-settings-sub">
                          <span>예보 시정 임계값 (m)</span>
                          <input type="number" min={500} max={10000} step={500} value={cfg.params.vis_threshold}
                            onChange={(e) => updateTriggerParam(id, "vis_threshold", Number(e.target.value))} />
                        </label>
                      )}
                    </div>
                  ))}
                </fieldset>
              </>
            )}
          </div>
        </div>

        <div className="alert-settings-footer">
          <button className="btn-reset" onClick={handleReset}>초기화</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

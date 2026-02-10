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
};

export default function AlertSettings({ defaults, onClose, onSettingsChange }) {
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
    onSettingsChange?.(overrides);
    onClose();
  }

  function handleReset() {
    clearPersonalSettings();
    onSettingsChange?.(null);
    onClose();
  }

  return (
    <div className="alert-settings-overlay" onClick={onClose}>
      <div className="alert-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="alert-settings-header">
          <h2>알림 설정</h2>
          <button className="alert-popup-close" onClick={onClose}>&times;</button>
        </div>

        <div className="alert-settings-body">
          {/* Global */}
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

          {/* Dispatchers */}
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

          {/* Triggers */}
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
        </div>

        <div className="alert-settings-footer">
          <button className="btn-reset" onClick={handleReset}>초기화</button>
          <button className="btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

import React from "react";

/**
 * 아이콘 키에 따른 임시 이모지 매핑
 * 실제 SVG 파일이 준비되면 이 컴포넌트 내부에서 <img> 태그로 교체합니다.
 */
const EMOJI_MAP = {
  SKC_D: "☀️", SKC_N: "🌙",
  FEW_D: "🌤️", FEW_N: "🌙",
  SCT_D: "⛅", SCT_N: "☁️",
  BKN_D: "☁️", BKN_N: "☁️",
  OVC_D: "☁️", OVC_N: "☁️",
  RA_D: "🌧️", RA_N: "🌧️",
  SN_D: "❄️", SN_N: "❄️",
  TSRA_D: "⛈️", TSRA_N: "⛈️",
  FG_D: "🌫️", FG_N: "🌫️",
  BR_D: "🌫️", BR_N: "🌫️",
  CAVOK_D: "☀️", CAVOK_N: "🌙",
  UNKNOWN: "❓"
};

export default function WeatherIcon({ iconKey, className = "", alt = "" }) {
  // iconKey 예: "wx_RA_D" -> "RA_D" 추출
  const key = iconKey?.replace("wx_", "") || "UNKNOWN";
  const emoji = EMOJI_MAP[key] || EMOJI_MAP[key.split('_')[0] + '_D'] || "☁️";

  return (
    <div className={`weather-icon-wrapper ${className}`} title={iconKey}>
      {/* 나중에 실제 아이콘 파일이 있을 경우 아래 주석을 해제하고 사용하세요 */}
      {/* <img src={`/assets/icons/weather/${iconKey}.svg`} alt={alt} /> */}
      <span style={{ fontSize: "2rem" }}>{emoji}</span>
    </div>
  );
}

export function WindBarb({ barbKey, rotation, className = "" }) {
  // 풍향계 임시 표현 (화살표)
  return (
    <div 
      className={`wind-barb-wrapper ${className}`} 
      style={{ 
        display: "inline-block", 
        transform: `rotate(${rotation}deg)`,
        fontSize: "1.5rem"
      }}
      title={`${barbKey} at ${rotation}°`}
    >
      ↑
    </div>
  );
}

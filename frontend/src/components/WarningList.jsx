import { safe, warningMeta, getDisplayDate } from "../utils/helpers";

const WARNING_NAME_KO = {
  WIND_SHEAR: "급변풍",
  LOW_VISIBILITY: "저시정",
  STRONG_WIND: "강풍",
  HEAVY_RAIN: "호우",
  LOW_CEILING: "저운고",
  THUNDERSTORM: "뇌우",
  TYPHOON: "태풍",
  HEAVY_SNOW: "대설",
  YELLOW_DUST: "황사",
  UNKNOWN: "미확인경보",
};

function formatValidTime(value, tz = "UTC") {
  if (!value) return "--일 --시 --분";
  const date = getDisplayDate(value, tz);
  if (Number.isNaN(date.getTime())) return "--일 --시 --분";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day}일 ${hour}시 ${minute}분`;
}

export default function WarningList({ warningData, icao, warningTypes, tz = "UTC" }) {
  const block = warningData?.airports?.[icao];
  const list = block?.warnings || [];

  if (list.length === 0) {
    return (
      <div className="warning-banner warning-banner--ok">
        <span className="warning-banner-icon">&#10003;</span>
        <span>공항경보 없음</span>
      </div>
    );
  }

  return (
    <div className="warning-banner warning-banner--danger">
      <span className="warning-banner-icon warning-banner-icon--alert">&#9888;</span>
      <span className="warning-banner-label">공항경보:</span>
      <span className="warning-banner-text">
        {list.map((item, i) => {
          const meta = warningMeta(item.wrng_type, warningTypes || {}) || {};
          const key = item.wrng_type_key === "UNKNOWN" && meta.key ? meta.key : item.wrng_type_key;
          const name = WARNING_NAME_KO[key] || safe(item.wrng_type_name) || "미확인경보";
          return (
            <span key={i} className="warning-banner-item">
              {i > 0 && <span className="warning-banner-separator">|</span>}
              <strong>{name}</strong>
              {" "}
              <span className="warning-banner-time">
                {formatValidTime(item.valid_start, tz)} ~ {formatValidTime(item.valid_end, tz)}
              </span>
            </span>
          );
        })}
      </span>
    </div>
  );
}

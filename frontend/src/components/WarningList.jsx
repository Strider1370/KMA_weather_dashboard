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

  return (
    <article className="panel">
      <h3>공항경보</h3>
      <div className="warning-list">
        {list.length === 0 ? (
          <div className="warning-item">
            <strong>유효한 경보 없음</strong>
            <span>현재 발효 중인 공항경보가 없습니다.</span>
          </div>
        ) : (
          list.map((item, i) => {
            const meta = warningMeta(item.wrng_type, warningTypes || {}) || {};
            const color = meta.color || "#d4603a";
            const key = item.wrng_type_key === "UNKNOWN" && meta.key ? meta.key : item.wrng_type_key;
            const name = WARNING_NAME_KO[key] || safe(item.wrng_type_name) || "미확인경보";
            const validRange = `${formatValidTime(item.valid_start, tz)} ~ ${formatValidTime(item.valid_end, tz)}`;

            return (
              <article
                key={i}
                className="warning-item"
                style={{ borderLeftColor: color, background: `${color}18` }}
              >
                <strong>{safe(name)}</strong>
                <span className="warning-time-label">유효시간</span>
                <span className="warning-time-value">{validRange}</span>
              </article>
            );
          })
        )}
      </div>
    </article>
  );
}

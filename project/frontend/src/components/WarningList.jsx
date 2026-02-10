import { safe, formatUtc, warningMeta } from "../utils/helpers";

export default function WarningList({ warningData, icao, warningTypes }) {
  const block = warningData?.airports?.[icao];
  const list = block?.warnings || [];

  return (
    <article className="panel">
      <h3>Active Warnings</h3>
      <div className="warning-list">
        {list.length === 0 ? (
          <div className="warning-item">
            <strong>No active warnings</strong>
            <span>Airport has no current warning.</span>
          </div>
        ) : (
          list.map((item, i) => {
            const meta = warningMeta(item.wrng_type, warningTypes || {}) || {};
            const color = meta.color || "#d4603a";
            const title = item.wrng_type_key === "UNKNOWN" && meta.key ? meta.key : item.wrng_type_key;
            const name = item.wrng_type_name === "Unknown Warning" && meta.name ? meta.name : item.wrng_type_name;

            return (
              <article
                key={i}
                className="warning-item"
                style={{ borderLeftColor: color, background: `${color}18` }}
              >
                <strong>{safe(title)}</strong>
                <span>{safe(name)}</span>
                <span>{formatUtc(item.valid_start)} -&gt; {formatUtc(item.valid_end)}</span>
              </article>
            );
          })
        )}
      </div>
    </article>
  );
}

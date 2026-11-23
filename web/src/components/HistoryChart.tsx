import type { HistoryPoint, Network } from "../types";
type Series = "cpu" | "gpu" | "rx" | "tx";
import { finite, fmt, colors, bytes } from "../format";
export function chartPath(
  history: HistoryPoint[],
  key: Series,
  max: number,
  maxGap = 10,
  now?: number,
) {
  const last = history.at(-1);
  if (!last) return "";
  let path = "",
    previous: number | null = null;
  for (const point of history) {
    const value = point[key];
    if (!finite(value)) {
      previous = null;
      continue;
    }
    const x = 600 - ((now ?? last.t) - point.t) * 5;
    if (x < 0 || x > 600) continue;
    const y = 98 - Math.max(0, Math.min(1, value / max)) * 96;
    path += `${previous !== null && point.t - previous < maxGap ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    previous = point.t;
  }
  return path;
}
export function HistoryChart({
  kind,
  history = [],
  unavailable,
  network = {},
  maxGap = 10,
  now,
}: {
  kind: "cpu" | "gpu" | "network";
  history?: HistoryPoint[];
  unavailable?: string | null;
  network?: Network;
  maxGap?: number;
  now?: number;
}) {
  const isNetwork = kind === "network";
  const max = isNetwork
    ? Math.max(1024, ...history.flatMap((p) => [p.rx, p.tx]).filter(finite))
    : 100;
  const scale = max >= 1073741824 ? 1073741824 : max >= 1048576 ? 1048576 : max >= 1024 ? 1024 : 1;
  const unit =
    scale === 1073741824 ? "GiB/s" : scale === 1048576 ? "MiB/s" : scale === 1024 ? "KiB/s" : "B/s";
  const tick = (n: number) =>
    isNetwork ? `${fmt(n / scale, n === 0 || n / scale >= 10 ? 0 : 1)} ${unit}` : `${fmt(n)}%`;
  const lines: [Series, string][] = isNetwork
    ? [
        ["rx", colors.blue],
        ["tx", colors.orange],
      ]
    : [[kind, kind === "cpu" ? colors.blue : colors.purple]];
  return (
    <div
      className={`chart-box ${isNetwork ? "network" : ""}`}
      aria-label={`${kind.toUpperCase()} history`}
    >
      <div className="legend">
        {isNetwork ? (
          <>
            <span>
              <i />↓ Receive
            </span>
            <span>
              <i className="orange" />↑ Transmit
            </span>
          </>
        ) : (
          <span>
            <i className={kind === "gpu" ? "purple" : ""} />
            {kind.toUpperCase()} · 0–100%
          </span>
        )}
      </div>
      <div className="plot">
        <svg
          viewBox="0 0 600 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${kind} over the last two minutes`}
        >
          {[0, 50, 100].map((y) => (
            <path key={y} className="gridline" d={`M0 ${y}H600`} />
          ))}
          {lines.map(([key, color]) => (
            <path
              key={key}
              className="line"
              stroke={color}
              d={chartPath(history, key, max, maxGap, now)}
            />
          ))}
        </svg>
        <div className="y-axis">
          {[max, max / 2, 0].map((n) => (
            <span key={n}>{tick(n)}</span>
          ))}
        </div>
        <div className="x-axis">
          <span>−2 min</span>
          <span>−1 min</span>
          <span>Now</span>
        </div>
        {unavailable && <div className="unavailable">{unavailable}</div>}
      </div>
      {isNetwork && (
        <div className="row">
          <span>
            ↓ {bytes(network.download)}/s ↑ {bytes(network.upload)}/s
          </span>
        </div>
      )}
    </div>
  );
}

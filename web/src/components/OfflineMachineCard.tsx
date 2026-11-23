import type { Metrics, HistoryPoint } from "../types";
import { finite } from "../format";
import { HistoryChart } from "./HistoryChart";
export function elapsedLabel(seconds: number) {
  const [value, unit] =
    seconds < 60
      ? [Math.floor(seconds), "second"]
      : seconds < 3600
        ? [Math.floor(seconds / 60), "minute"]
        : seconds < 86400
          ? [Math.floor(seconds / 3600), "hour"]
          : [Math.floor(seconds / 86400), "day"];
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}
export function OfflineMachineCard({
  name,
  metrics,
  history = [],
  now,
}: {
  name: string;
  metrics?: Metrics;
  history?: HistoryPoint[];
  now: number;
}) {
  const lastSeen =
    finite(metrics?.timestamp) && metrics.timestamp >= 0 && metrics.timestamp <= now
      ? metrics.timestamp
      : undefined;
  const end = history.at(-1)?.t;
  const hasHistory = finite(end) && end <= now;
  return (
    <article className="machine offline-machine" aria-label={`${name} machine`}>
      <div className="head">
        <div>
          <h2>{name}</h2>
          <div className="subtitle">
            {metrics
              ? `${metrics.hardware_model ? metrics.hardware_model + " · " : ""}${metrics.cpu_name}`
              : "Awaiting hardware details"}
          </div>
        </div>
        <span className="pill disconnected">● Offline</span>
      </div>
      <div className="offline-message">
        <span className="offline-kicker">
          {lastSeen === undefined ? "NO TELEMETRY" : "CONNECTION LOST"}
        </span>
        <h3>Waiting for {name}</h3>
        <p>
          {lastSeen === undefined ? (
            "No telemetry received yet."
          ) : (
            <>
              No telemetry received for <strong>{elapsedLabel(now - lastSeen)}</strong>.
            </>
          )}
        </p>
        <span className="offline-resume">Readings resume automatically when it reconnects.</span>
      </div>
      <div className="offline-history">
        {hasHistory ? (
          <>
            <div className="history-heading">
              <span>Last recorded activity</span>
              <span>Stopped updating</span>
            </div>
            <div className="graphs last-activity">
              {(["cpu", "gpu", "network"] as const).map((kind) => (
                <HistoryChart
                  key={kind}
                  kind={kind}
                  history={history}
                  now={end}
                  frozen
                  unavailable={
                    history.some((p) =>
                      kind === "network" ? finite(p.rx) || finite(p.tx) : finite(p[kind]),
                    )
                      ? null
                      : "No recorded samples"
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <p className="offline-empty">No recorded activity available.</p>
        )}
      </div>
      <div className="offline-footer">
        <span>
          Last seen{" "}
          <strong>
            {lastSeen === undefined ? "—" : new Date(lastSeen * 1000).toLocaleString("en-GB")}
          </strong>
        </span>
        <span>{metrics?.network.address || ""}</span>
      </div>
    </article>
  );
}

import { bytes, fmt, fresh } from "../format";
import type { Metrics, ProcessReading } from "../types";

function ProcessList({
  rows,
  kind,
  empty,
}: {
  rows: ProcessReading[];
  kind: "memory" | "cpu";
  empty: string;
}) {
  return (
    <section
      className={`process-list process-${kind}`}
      aria-label={kind === "memory" ? "Top memory processes" : "Top CPU processes"}
    >
      <h3>{kind === "memory" ? "Top memory · RSS" : "Top CPU · host %"}</h3>
      {rows.length ? (
        <ol>
          {rows.slice(0, 3).map((row) => (
            <li key={row.pid}>
              <span className="process-identity">
                <span className="process-name">{row.name}</span>
                <small>#{row.pid}</small>
              </span>
              <strong>{kind === "memory" ? bytes(row.rss) : `${fmt(row.cpu, 1)}%`}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="process-empty">{empty}</p>
      )}
    </section>
  );
}
export function ProcessPanel({ metrics, now }: { metrics: Metrics; now: number }) {
  const p = metrics.processes;
  if (!p?.available || !fresh(p.timestamp, now, 15))
    return (
      <section className="processes-panel process-unavailable" aria-label="Top processes">
        <span>Process telemetry unavailable</span>
      </section>
    );
  return (
    <section className="processes-panel" aria-label="Top processes">
      <div className="process-columns">
        <ProcessList rows={p.memory} kind="memory" empty="No readable memory usage" />
        <ProcessList
          rows={p.cpu}
          kind="cpu"
          empty={p.cpu_ready ? "No CPU activity" : "Measuring CPU…"}
        />
      </div>
      <div className="process-memory-context">
        {p.arc ? (
          <span>
            ZFS ARC <strong>{bytes(p.arc.size)}</strong>
          </span>
        ) : (
          metrics.zfs && <span>ARC unavailable</span>
        )}
        <span>
          Available <strong>{bytes(metrics.memory.available)}</strong>
        </span>
        <span>
          Swap <strong>{bytes(metrics.memory.swap_used)}</strong>
        </span>
        {p.partial && <span className="warn">Some processes hidden</span>}
      </div>
    </section>
  );
}

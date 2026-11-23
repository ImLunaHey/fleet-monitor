import type { Metrics } from "../types";
import { finite, fmt, fresh } from "../format";
export function LlmStatus({
  llm,
  now,
  services,
}: {
  llm: NonNullable<Metrics["llm"]>;
  now: number;
  services: string;
}) {
  if (!llm.available || !fresh(llm.timestamp, now, 20))
    return <span className="warn">Inference telemetry unavailable</span>;
  return (
    <div className="llm-line">
      <span className="llm-name" title={llm.model}>
        {llm.model}
      </span>
      <span className={llm.active && llm.active > 0 ? "llm-state" : "good"}>
        ● {llm.active && llm.active > 0 ? "Active" : "Idle"}
      </span>
      <span title="Generation throughput reported by llama.cpp">
        {fmt(llm.tokensPerSecond, 1)}{" "}
        <small>tok/s{llm.active === 0 && finite(llm.tokensPerSecond) ? " last" : ""}</small>
      </span>
      <span>
        {fmt(llm.active)} <small>active</small>
      </span>
      <span>
        {fmt(llm.queued)} <small>queued</small>
      </span>
      <span className="llm-service">{services}</span>
    </div>
  );
}

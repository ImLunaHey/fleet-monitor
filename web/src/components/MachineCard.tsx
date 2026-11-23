import type { Metrics, HistoryPoint, DriveSlots } from "../types";
import { bytes, colors, finite, fmt, gib } from "../format";
import { HistoryChart } from "./HistoryChart";
import { GpuPanel } from "./GpuPanel";
import { BatteryStatus } from "./BatteryStatus";
import { MetricTile, Meter, StatRow } from "./Primitives";
import { LlmStatus } from "./LlmStatus";
import { ZfsPanel } from "./ZfsPanel";
export function MachineCard({
  name,
  metrics: d,
  history,
  featured = false,
  driveSlots,
  now,
}: {
  name: string;
  metrics: Metrics;
  history?: HistoryPoint[];
  featured?: boolean;
  driveSlots?: DriveSlots;
  now: number;
}) {
  const gpuUnavailable = finite(d.gpu?.usage)
    ? null
    : d.gpu?.status === "absent"
      ? "No hardware GPU"
      : d.gpu?.reason || "GPU readings unavailable";
  const pressure = d.disk.percent >= 95 ? "bad" : d.disk.percent >= 85 ? "warn" : "";
  const minutes = Math.floor(d.uptime / 60);
  const services = Object.entries(d.services || {})
    .map(([label, healthy]) => `${label} ${healthy ? "online" : "unavailable"}`)
    .join(" · ");
  return (
    <article className="machine" aria-label={`${name} machine`}>
      <div className="head">
        <div>
          <h2>{name}</h2>
          <div className="subtitle">
            {d.hardware_model ? `${d.hardware_model} · ` : ""}
            {d.cpu_name}
          </div>
        </div>
        <span className="pill online">● Online</span>
      </div>
      <div className="tiles">
        <MetricTile label="CPU load" value={fmt(d.cpu.usage, 1)} unit="%" />
        <MetricTile
          label="Memory used"
          value={fmt(gib(d.memory.used), 1)}
          unit={`/ ${fmt(gib(d.memory.total), 1)} GiB`}
        />
        <MetricTile
          label="CPU temp"
          value={fmt(d.cpu.temperature)}
          unit={finite(d.cpu.temperature) ? "°C" : ""}
        />
        <MetricTile
          label="Disk used"
          value={fmt(gib(d.disk.used))}
          unit={`/ ${fmt(gib(d.disk.total))} GiB`}
        />
      </div>
      <div className="graphs">
        <HistoryChart now={now} kind="cpu" history={history} />
        <HistoryChart now={now} kind="gpu" history={history} unavailable={gpuUnavailable} />
        <HistoryChart now={now} kind="network" history={history} network={d.network} />
      </div>
      <GpuPanel gpu={d.gpu} />
      {featured && d.zfs ? (
        <ZfsPanel zfs={d.zfs} now={now} slots={driveSlots} />
      ) : (
        <div className="details">
          <StatRow label="Disk space" tone={pressure}>
            {bytes(d.disk.free)} free · {fmt(d.disk.percent)}% used
          </StatRow>
          <Meter
            label="Disk used"
            value={d.disk.percent}
            color={
              pressure === "bad" ? colors.red : pressure === "warn" ? colors.amber : colors.blue
            }
          />
          <StatRow label="Disk read / write">
            {finite(d.disk.read) && finite(d.disk.write)
              ? `${bytes(d.disk.read)}/s · ${bytes(d.disk.write)}/s`
              : "Reading unavailable"}
          </StatRow>
          <StatRow label="Disk IOPS">
            {finite(d.disk.iops) ? `${fmt(d.disk.iops, 1)} operations/s` : "Reading unavailable"}
          </StatRow>
        </div>
      )}
      <div className="health-line" data-id="services">
        {d.llm ? (
          <LlmStatus llm={d.llm} now={now} services={services} />
        ) : d.battery ? (
          <BatteryStatus battery={d.battery} />
        ) : featured ? (
          ""
        ) : (
          services || "Live hardware telemetry"
        )}
      </div>
      <div className="footer">
        <span>
          Up {Math.floor(minutes / 1440)}d {Math.floor(minutes / 60) % 24}h
        </span>
        <span>{d.network.address}</span>
        <span>{new Date(d.timestamp * 1000).toLocaleTimeString("en-GB")}</span>
      </div>
    </article>
  );
}

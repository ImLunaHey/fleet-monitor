import { finite, fmt, colors } from "../format";
import { Meter, StatRow } from "./Primitives";
export function GpuPanel({ gpu }) {
  const g = gpu,
    hasMemory =
      finite(g?.memory_used) && finite(g?.memory_total) && g.memory_total > 0;
  const parts = g
    ? [g.name.replace("NVIDIA GeForce ", "")]
    : ["GPU inventory unavailable"];
  if (finite(g?.usage)) parts.push(`${fmt(g.usage)}%`);
  if (finite(g?.temperature)) parts.push(`${fmt(g.temperature)}°C`);
  if (finite(g?.power)) parts.push(`${fmt(g.power)} W`);
  if (finite(g?.core_clock)) parts.push(`${fmt(g.core_clock)} MHz`);
  if (g?.reason) parts.push(g.reason);
  const label =
    g?.kind === "discrete"
      ? "VRAM used"
      : g?.memory_label === "Reserved UMA"
        ? "Reserved GPU memory"
        : "GPU shared memory";
  const value = hasMemory
    ? `${fmt(g.memory_used / 1024, 1)} / ${fmt(g.memory_total / 1024, 1)} GiB`
    : g?.status === "absent"
      ? "No hardware GPU"
      : g?.kind === "integrated"
        ? "Shared system RAM · usage unavailable"
        : "Reading unavailable";
  const percent = hasMemory ? (100 * g.memory_used) / g.memory_total : 0;
  return (
    <div className="gpu-panel">
      <div className="health-line">{parts.join(" · ")}</div>
      <StatRow label={label} tone={percent > 90 ? "warn" : ""}>
        {value}
      </StatRow>
      {hasMemory && (
        <Meter label={label} value={percent} color={colors.purple} />
      )}
    </div>
  );
}

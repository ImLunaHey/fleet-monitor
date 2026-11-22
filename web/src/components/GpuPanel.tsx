import type { Gpu } from "../types";
import { finite, fmt, colors, bytes } from "../format";
import { Meter, StatRow } from "./Primitives";
export function GpuPanel({ gpu }: { gpu?: Gpu | null }) {
  const g = gpu;
  const used = g?.memory_used;
  const total = g?.memory_total;
  const hasMemory = finite(used) && finite(total) && total > 0;
  const parts = g ? [g.name.replace("NVIDIA GeForce ", "")] : ["GPU inventory unavailable"];
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
        : g?.memory_label === "GPU client RAM"
          ? "GPU client RAM"
          : "GPU shared memory";
  const value = hasMemory
    ? `${fmt(used / 1024, 1)} / ${fmt(total / 1024, 1)} GiB`
    : finite(used)
      ? `${bytes(used * 1048576)} used · shared system RAM`
      : g?.status === "absent"
        ? "No hardware GPU"
        : g?.kind === "integrated"
          ? "Shared system RAM · usage unavailable"
          : "Reading unavailable";
  const percent = hasMemory ? (100 * used) / total : 0;
  return (
    <div className="gpu-panel">
      <div className="health-line">{parts.join(" · ")}</div>
      <StatRow label={label} tone={percent > 90 ? "warn" : ""}>
        <span title={g?.memory_note}>{value}</span>
      </StatRow>
      {hasMemory && <Meter label={label} value={percent} color={colors.purple} />}
    </div>
  );
}

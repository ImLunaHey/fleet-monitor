import type { Fleet, FleetConfig, UnifiSnapshot } from "../types";
import { bytes, finite, fresh, online } from "../format";
export interface FleetAlert {
  id: string;
  text: string;
  critical: boolean;
}
export function collectAlerts(
  fleet: Fleet,
  config: FleetConfig,
  now: number,
  network?: UnifiSnapshot,
  error = false,
  networkError = false,
) {
  const alerts: FleetAlert[] = [];
  const add = (id: string, text: string, critical = false) => alerts.push({ id, text, critical });
  if (error) add("connection", "Telemetry connection lost", true);
  const expected = new Set(config.alertHosts ?? []);
  for (const [name, host] of Object.entries(fleet)) {
    if (!online(host, now)) {
      if (expected.has(name) || host.metrics)
        add(name + ":stale", `${name} · telemetry unavailable`);
      continue;
    }
    const d = host.metrics;
    if (d.disk.percent >= 95) add(name + ":disk", `${name} · ${bytes(d.disk.free)} free`, true);
    if (finite(d.cpu.temperature) && d.cpu.temperature >= 90)
      add(name + ":cpu", `${name} · CPU ${Math.round(d.cpu.temperature)}°C`, true);
    if (finite(d.gpu?.temperature) && d.gpu.temperature >= 85)
      add(name + ":gpu", `${name} · GPU ${Math.round(d.gpu.temperature)}°C`, true);
    for (const [label, ok] of Object.entries(d.services ?? {}))
      if (!ok) add(name + ":service:" + label, `${name} · ${label} unavailable`, true);
    if (d.llm && (!d.llm.available || !fresh(d.llm.timestamp, now, 20)))
      add(name + ":llm", `${name} · inference telemetry unavailable`);
    const z = d.zfs;
    if (z) {
      if (!z.available || !fresh(z.timestamp, now, 35))
        add(name + ":zfs-stale", `${name} · ZFS telemetry unavailable`);
      else {
        if (z.state && z.state !== "ONLINE")
          add(name + ":zfs", `${name} · ZFS ${z.state.toLowerCase()}`);
        if ((z.data_errors ?? 0) > 0) add(name + ":integrity", `${name} · ZFS data errors`, true);
        const hot = (z.drives ?? []).filter((d) => finite(d.temperature) && d.temperature >= 45);
        if (hot.length)
          add(
            name + ":drives",
            `${name} · ${hot.length} hot drive${hot.length === 1 ? "" : "s"}`,
            hot.some((d) => (d.temperature ?? 0) >= 55),
          );
      }
    }
  }
  for (const name of expected)
    if (!fleet[name]) add(name + ":stale", `${name} · telemetry unavailable`);
  if (config.networkEnabled) {
    if (networkError || !network?.available || !fresh(network.timestamp, now, 35))
      add("unifi", "UniFi telemetry unavailable");
    else
      for (const device of network.devices ?? []) {
        if (device.state !== "ONLINE" || !fresh(device.timestamp, now, 90))
          add(
            "unifi:" + device.id,
            `${device.name} · ${device.state === "ONLINE" ? "telemetry stale" : "offline"}`,
          );
      }
  }
  return alerts.sort((a, b) => Number(b.critical) - Number(a.critical) || a.id.localeCompare(b.id));
}
export function HeaderAlerts({ alerts, now }: { alerts: FleetAlert[]; now: number }) {
  if (!alerts.length) return null;
  const start = (Math.floor(now / 8) % Math.ceil(alerts.length / 3)) * 3;
  return (
    <output className="header-alerts" aria-label="Fleet alerts">
      <span className="alert-label">
        {alerts.length} alert{alerts.length === 1 ? "" : "s"}
      </span>
      {alerts.slice(start, start + 3).map((a) => (
        <span
          key={a.id}
          className={`alert-chip ${a.critical ? "critical" : "warning"}`}
          title={a.text}
        >
          ● {a.text}
        </span>
      ))}
      {alerts.length > 3 && (
        <span className="alert-page">
          {Math.floor(start / 3) + 1}/{Math.ceil(alerts.length / 3)}
        </span>
      )}
    </output>
  );
}

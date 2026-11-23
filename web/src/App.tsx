import { DashboardAccess } from "./components/DashboardAccess";
import { HeaderAlerts, collectAlerts } from "./components/HeaderAlerts";
import { NetworkStrip } from "./components/NetworkStrip";
import type { Fleet, FleetConfig, Histories, UnifiSnapshot } from "./types";
import { useEffect, useState } from "react";
import { useFleet } from "./fleet";
import { online, bytes, fmt } from "./format";
import { OfflineMachineCard } from "./components/OfflineMachineCard";
import { MachineCard } from "./components/MachineCard";
export function Dashboard({
  fleet,
  config = {},
  histories = {},
  error = false,
  now,
  network,
  networkError = false,
  networkHistories = {},
}: {
  fleet: Fleet;
  config?: FleetConfig;
  histories?: Histories;
  error?: boolean;
  now: number;
  network?: UnifiSnapshot;
  networkError?: boolean;
  networkHistories?: Histories;
}) {
  const expected = new Set(config.alertHosts || []);
  const order = [...new Set([...(config.order || []), ...expected, ...Object.keys(fleet)])].filter(
    (name) => fleet[name] || expected.has(name) || name === config.featuredHost,
  );
  const compact = new Set(config.compactHosts || []),
    featured = config.featuredHost;
  const live = order.filter((name) => online(fleet[name], now));
  const regular = order.filter(
    (name) =>
      name !== featured && !compact.has(name) && (fleet[name]?.metrics || expected.has(name)),
  );
  const offline = order.filter(
    (name) =>
      !online(fleet[name], now) &&
      !compact.has(name) &&
      !regular.includes(name) &&
      name !== featured,
  );
  return (
    <main className={config.networkEnabled ? "network-layout" : undefined}>
      <header>
        <div>
          <div className="eyebrow">{config.title || "Fleet Monitor"} / live system overview</div>
          {!config.networkEnabled && <h1>Machines</h1>}
        </div>
        <HeaderAlerts
          alerts={collectAlerts(fleet, config, now, network, error, networkError)}
          now={now}
        />
        <div className="clock">{new Date(now * 1000).toLocaleString("en-GB")}</div>
        <DashboardAccess url={config.publicUrl} />
      </header>
      {config.networkEnabled && (
        <NetworkStrip data={network} now={now} error={networkError} histories={networkHistories} />
      )}
      <div className="wall" style={!featured ? { gridTemplateColumns: "1fr" } : undefined}>
        <section className="machines" aria-label="Machines">
          {regular.map((name) => {
            const host = fleet[name];
            return online(host, now) ? (
              <MachineCard
                key={name}
                name={name}
                metrics={host.metrics}
                history={histories[name]}
                now={now}
              />
            ) : (
              <OfflineMachineCard
                key={name}
                name={name}
                metrics={host?.metrics}
                history={histories[name]}
                now={now}
              />
            );
          })}
        </section>
        {featured && (
          <section className="featured-host" aria-label="Featured machine">
            {online(fleet[featured], now) ? (
              <MachineCard
                name={featured}
                metrics={fleet[featured].metrics}
                history={histories[featured]}
                featured
                driveSlots={config.driveSlots?.[featured]}
                now={now}
              />
            ) : (
              <OfflineMachineCard
                name={featured}
                metrics={fleet[featured]?.metrics}
                history={histories[featured]}
                now={now}
              />
            )}
          </section>
        )}
      </div>
      {!config.hideOfflineFooter && (
        <div className="bottomline">
          <div className="offline-hosts">
            {offline.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          {[...compact].map((name) => {
            const host = fleet[name];
            const isOnline = online(host, now);
            const d = isOnline ? host.metrics : undefined;
            return (
              <span key={name} className={`compact-status ${isOnline ? "online" : ""}`}>
                {d
                  ? `● ${name} online · CPU ${fmt(d.cpu.usage, 1)}% · RAM ${bytes(d.memory.used)} / ${bytes(d.memory.total)} · Disk ${bytes(d.disk.used)} / ${bytes(d.disk.total)}`
                  : `${name} · offline`}
              </span>
            );
          })}
          <span>
            {error
              ? "Telemetry connection lost"
              : `${live.length} / ${order.length} machines online`}
          </span>
          <span>Live · refreshes automatically</span>
        </div>
      )}
    </main>
  );
}
export default function App() {
  const data = useFleet();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Dashboard {...data} now={now} />;
}

import { useEffect, useState } from "react";
import { useFleet } from "./fleet";
import { online, bytes, fmt } from "./format";
import { MachineCard } from "./components/MachineCard";
export function Dashboard({
  fleet,
  config = {},
  histories = {},
  error = false,
  now = Date.now() / 1000,
}) {
  const order = [
    ...new Set([...(config.order || []), ...Object.keys(fleet)]),
  ].filter((name) => fleet[name]);
  const compact = new Set(config.compactHosts || []),
    featured = config.featuredHost;
  const live = order.filter((name) => online(fleet[name], now));
  const regular = live.filter(
    (name) => name !== featured && !compact.has(name),
  );
  const offline = order.filter(
    (name) => !online(fleet[name], now) && !compact.has(name),
  );
  return (
    <main>
      <header>
        <div>
          <div className="eyebrow">
            {config.title || "Fleet Monitor"} / live system overview
          </div>
          <h1>Machines</h1>
        </div>
        <div className="clock">
          {new Date(now * 1000).toLocaleString("en-GB")}
        </div>
      </header>
      <div
        className="wall"
        style={!featured ? { gridTemplateColumns: "1fr" } : undefined}
      >
        <section className="machines" aria-label="Machines">
          {regular.map((name) => (
            <MachineCard
              key={name}
              name={name}
              metrics={fleet[name].metrics}
              history={histories[name]}
              now={now}
            />
          ))}
        </section>
        {featured && (
          <section className="featured-host" aria-label="Featured machine">
            {live.includes(featured) && (
              <MachineCard
                name={featured}
                metrics={fleet[featured].metrics}
                history={histories[featured]}
                featured
                now={now}
              />
            )}
          </section>
        )}
      </div>
      <div className="bottomline">
        <div className="offline-hosts">
          {offline.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        {[...compact].map((name) => {
          const d = fleet[name]?.metrics,
            isOnline = online(fleet[name], now);
          return (
            <span
              key={name}
              className={`compact-status ${isOnline ? "online" : ""}`}
            >
              {isOnline
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
    </main>
  );
}
export default function App() {
  const data = useFleet();
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Dashboard {...data} now={now} />;
}

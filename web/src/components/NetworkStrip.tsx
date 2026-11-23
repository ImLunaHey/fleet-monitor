import { WanPanel } from "./WanPanel";
import type { Histories, HistoryPoint, UnifiDevice, UnifiPort, UnifiSnapshot } from "../types";
import { finite, fmt, fresh } from "../format";
const deviceOrder = { gateway: 0, switch: 1, ap: 2 };
export function uptime(seconds: unknown) {
  if (!finite(seconds)) return "—";
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h`;
}
function speed(port: UnifiPort) {
  if (port.state !== "UP" || !finite(port.speedMbps)) return "—";
  return port.speedMbps >= 1000
    ? `${fmt(port.speedMbps / 1000, port.speedMbps % 1000 ? 1 : 0)}G`
    : `${port.speedMbps}M`;
}
function GatewayMetrics({
  device,
  data,
  history,
  now,
}: {
  device: UnifiDevice;
  data: UnifiSnapshot;
  history?: HistoryPoint[];
  now: number;
}) {
  if (device.extraTimestamp !== undefined)
    return <WanPanel device={device} data={data} history={history} now={now} />;
  return (
    <>
      <div className="gateway-metrics">
        <div>
          <b>{data.clients}</b>
          <span>connected clients</span>
        </div>
        <div>
          <b>
            {fmt(device.cpu, 1)}
            <small>%</small>
          </b>
          <span>CPU load</span>
        </div>
        <div>
          <b>
            {fmt(device.memory, 1)}
            <small>%</small>
          </b>
          <span>Memory used</span>
        </div>
        <div>
          <b>{uptime(device.uptime)}</b>
          <span>Uptime</span>
        </div>
      </div>
      <div className="network-foot">
        {data.wired} wired · {data.wireless} wireless<span>UniFi Network</span>
      </div>
    </>
  );
}
function SwitchMetrics({ device, now }: { device: UnifiDevice; now: number }) {
  const extra = fresh(device.extraTimestamp, now, 90);
  const ports = device.ports ?? [];
  return (
    <>
      <div className="switch-body">
        <div className="switch-count">
          <b>
            {device.ports
              ? `${ports.filter((p) => p.state === "UP").length} / ${ports.length}`
              : "— / —"}
          </b>
          <span>
            ports up · {device.ports ? ports.filter((p) => p.poe?.state === "UP").length : "—"}{" "}
            supplying PoE
          </span>
        </div>
        <div className="port-grid">
          {ports.map((p) => (
            <div
              key={p.idx}
              className={`port-cell ${p.state !== "UP" ? "port-down" : p.speedMbps === 10000 ? "port-fast" : p.speedMbps === 100 ? "port-slow" : "port-normal"}`}
              aria-label={`Port ${p.idx}: ${p.state}, ${speed(p)}${p.poe?.state === "UP" ? ", supplying PoE" : ""}`}
            >
              <span>
                {p.idx}
                {p.poe?.state === "UP" && (
                  <span className="poe-mark" aria-hidden="true">
                    {" "}
                    ⚡
                  </span>
                )}
              </span>
              <b>{speed(p)}</b>
              {device.extraTimestamp !== undefined && (
                <small className="port-watts">
                  {p.poe ? `${fmt(extra ? p.powerWatts : null, 1)} W` : ""}
                </small>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="network-foot">
        {device.extraTimestamp !== undefined ? (
          <span>
            PoE{" "}
            <strong>
              {fmt(extra ? device.powerWatts : null, 1)} /{" "}
              {fmt(extra ? device.powerBudgetWatts : null)} W
            </strong>
            <i className="poe-budget">
              <i
                style={{
                  width:
                    extra &&
                    finite(device.powerWatts) &&
                    finite(device.powerBudgetWatts) &&
                    device.powerBudgetWatts > 0
                      ? `${Math.min(100, (100 * device.powerWatts) / device.powerBudgetWatts)}%`
                      : "0%",
                }}
              />
            </i>
          </span>
        ) : (
          <span>G = Gbps · M = Mbps</span>
        )}
        <span>
          CPU {fmt(device.cpu, 1)}% · RAM {fmt(device.memory, 1)}% · {uptime(device.uptime)} uptime
        </span>
      </div>
    </>
  );
}
function RadioMetrics({ device }: { device: UnifiDevice }) {
  return (
    <>
      <div className="wifi-body">
        <div className="wifi-count">
          <b>{device.clients}</b>
          <span>wireless clients</span>
        </div>
        <div className="radio-grid">
          {(device.radios ?? []).map((r) => (
            <div className="radio" key={r.frequencyGHz}>
              <b>
                {r.frequencyGHz}
                <small> GHz</small>
              </b>
              <span>
                Ch {fmt(r.channel)} · {fmt(r.channelWidthMHz)} MHz
              </span>
              <span>{fmt(r.txRetriesPct, 1)}% TX retries</span>
            </div>
          ))}
        </div>
      </div>
      <div className="network-foot">
        CPU {fmt(device.cpu, 1)}% · RAM {fmt(device.memory, 1)}%
        <span>{uptime(device.uptime)} uptime</span>
      </div>
    </>
  );
}
export function NetworkStrip({
  data,
  now,
  error = false,
  histories = {},
}: {
  data?: UnifiSnapshot;
  now: number;
  error?: boolean;
  histories?: Histories;
}) {
  const current = !error && data?.available && fresh(data.timestamp, now, 35);
  if (!current)
    return (
      <section className="network-strip network-unavailable" aria-label="UniFi network">
        <div className="network-card">
          <div className="network-title">
            <h2>UniFi Network</h2>
            <span className="warn">Telemetry unavailable</span>
          </div>
          <span className="network-foot">Waiting for a fresh controller reading</span>
        </div>
      </section>
    );
  return (
    <section className="network-strip" aria-label="UniFi network">
      {(data.devices ?? [])
        .toSorted(
          (a, b) => deviceOrder[a.kind] - deviceOrder[b.kind] || a.name.localeCompare(b.name),
        )
        .map((device) => {
          const healthy = device.state === "ONLINE" && fresh(device.timestamp, now, 90);
          return (
            <article className="network-card" key={device.id} aria-label={device.name}>
              <div className="network-title">
                <h2>{device.name}</h2>
                <span className={healthy ? "net-online" : "warn"}>
                  {healthy
                    ? "● Online"
                    : device.state === "ONLINE"
                      ? "Telemetry stale"
                      : device.state}
                </span>
              </div>
              {healthy ? (
                device.kind === "gateway" ? (
                  <GatewayMetrics
                    device={device}
                    data={data}
                    history={histories["wan:" + device.id]}
                    now={now}
                  />
                ) : device.kind === "ap" ? (
                  <RadioMetrics device={device} />
                ) : (
                  <SwitchMetrics device={device} now={now} />
                )
              ) : (
                <span className="network-foot">Current readings unavailable</span>
              )}
            </article>
          );
        })}
    </section>
  );
}

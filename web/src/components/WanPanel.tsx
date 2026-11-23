import type { UnifiDevice, UnifiSnapshot, HistoryPoint } from "../types";
import { bytes, finite, fresh, fmt } from "../format";
import { HistoryChart } from "./HistoryChart";
import { uptime } from "./NetworkStrip";
export function WanPanel({
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
  const current = fresh(device.extraTimestamp, now, 90);
  const wan = current ? (device.wan?.filter((w) => w.up) ?? []) : [];
  const sum = (key: "rx_bytes-r" | "tx_bytes-r") =>
    wan.length && wan.every((w) => finite(w[key]))
      ? wan.reduce((n, w) => n + (w[key] ?? 0), 0)
      : null;
  const download = sum("rx_bytes-r"),
    upload = sum("tx_bytes-r");
  return (
    <>
      <div className="gateway-expanded">
        <div className="gateway-clients">
          <b>{data.clients}</b>
          <span>connected clients</span>
          <small>
            {data.wired} wired · {data.wireless} wireless
          </small>
        </div>
        <div className="wan-readings">
          <span className="download">↓ {bytes(download)}/s</span>
          <span className="upload">↑ {bytes(upload)}/s</span>
        </div>
        <div className="wan-chart">
          <HistoryChart
            kind="network"
            history={history}
            maxGap={45}
            now={now}
            unavailable={download === null || upload === null ? "WAN telemetry unavailable" : null}
          />
        </div>
      </div>
      <div className="network-foot">
        CPU {fmt(device.cpu, 1)}% · RAM {fmt(device.memory, 1)}% · {uptime(device.uptime)} uptime
        <span>WAN · ↓ Download · ↑ Upload</span>
      </div>
    </>
  );
}

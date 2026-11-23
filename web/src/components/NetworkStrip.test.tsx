import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NetworkStrip, uptime } from "./NetworkStrip";
import { Dashboard } from "../App";
import type { UnifiSnapshot, UnifiDevice } from "../types";
import { now, metrics } from "../test-fixtures";
const device = (extra: Partial<UnifiDevice>): UnifiDevice => ({
  id: "device",
  name: "Device",
  kind: "gateway",
  state: "ONLINE",
  timestamp: now,
  cpu: 0,
  memory: 20,
  uptime: 90000,
  ports: [],
  radios: [],
  clients: 1,
  ...extra,
});
const data = (devices: UnifiDevice[]): UnifiSnapshot => ({
  available: true,
  timestamp: now,
  devices,
  clients: 19,
  wired: 9,
  wireless: 10,
});
describe("NetworkStrip", () => {
  it("keeps gateway, switches and access points in a stable order without mutating telemetry", () => {
    const devices = [
      device({ id: "ap", name: "Wi-Fi", kind: "ap" }),
      device({ id: "switch-b", name: "Switch B", kind: "switch" }),
      device({ id: "gateway", name: "Gateway", kind: "gateway" }),
      device({ id: "switch-a", name: "Switch A", kind: "switch" }),
    ];
    render(<NetworkStrip now={now} data={data(devices)} />);
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual([
      "Gateway",
      "Switch A",
      "Switch B",
      "Wi-Fi",
    ]);
    expect(devices[0]?.id).toBe("ap");
  });
  it("renders gateway counts, real zero load, and uptime", () => {
    render(<NetworkStrip now={now} data={data([device({ name: "Gateway" })])} />);
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("9 wired · 10 wireless")).toBeInTheDocument();
    expect(screen.getByText("1d 1h")).toBeInTheDocument();
    expect(screen.getByText("0.0")).toBeInTheDocument();
  });
  it("distinguishes port speeds, PoE state, unknown speed and disconnected ports", () => {
    render(
      <NetworkStrip
        now={now}
        data={data([
          device({
            name: "Switch",
            kind: "switch",
            ports: [
              { idx: 1, state: "UP", speedMbps: 10000, connector: "SFPPLUS", poe: { state: "UP" } },
              { idx: 2, state: "UP", speedMbps: 100, connector: "RJ45" },
              { idx: 3, state: "UP", speedMbps: 2500, connector: "RJ45" },
              { idx: 4, state: "UP", speedMbps: 1000, connector: "RJ45" },
              { idx: 5, state: "DOWN", speedMbps: 10, connector: "RJ45" },
              { idx: 6, state: "UP", speedMbps: null, connector: "RJ45" },
            ],
          }),
        ])}
      />,
    );
    expect(screen.getByText("5 / 6")).toBeInTheDocument();
    expect(screen.getByText("ports up · 1 supplying PoE")).toBeInTheDocument();
    expect(screen.getByLabelText("Port 1: UP, 10G, supplying PoE")).toHaveClass("port-fast");
    expect(screen.getByText("100M")).toBeInTheDocument();
    expect(screen.getByText("2.5G")).toBeInTheDocument();
    expect(screen.getByText("1G")).toBeInTheDocument();
    expect(screen.getByLabelText("Port 5: DOWN, —")).toHaveClass("port-down");
    expect(screen.getByLabelText("Port 6: UP, —")).toBeInTheDocument();
  });
  it("shows per-radio channel, width, zero retries and missing readings distinctly", () => {
    render(
      <NetworkStrip
        now={now}
        data={data([
          device({
            name: "AP",
            kind: "ap",
            clients: 10,
            radios: [
              { frequencyGHz: 5, channel: 128, channelWidthMHz: 80, txRetriesPct: 0 },
              { frequencyGHz: 6, channel: null, channelWidthMHz: null, txRetriesPct: null },
            ],
          }),
        ])}
      />,
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Ch 128 · 80 MHz")).toBeInTheDocument();
    expect(screen.getByText("0.0% TX retries")).toBeInTheDocument();
    expect(screen.getByText("—% TX retries")).toBeInTheDocument();
  });
  it.each([undefined, { ...data([]), available: false }, { ...data([]), timestamp: now - 36 }])(
    "does not present failed or stale telemetry as healthy",
    (snapshot) => {
      render(<NetworkStrip now={now} data={snapshot} />);
      expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
      expect(screen.queryByText("● Online")).not.toBeInTheDocument();
    },
  );
  it("marks the whole strip unavailable after a request failure", () => {
    render(<NetworkStrip now={now} data={data([device({})])} error />);
    expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
  });
  it("hides old per-device readings and distinguishes offline devices", () => {
    render(
      <NetworkStrip
        now={now}
        data={data([
          device({ id: "stale", name: "Stale", timestamp: now - 91 }),
          device({ id: "offline", name: "Offline", state: "OFFLINE" }),
        ])}
      />,
    );
    expect(screen.getByText("Telemetry stale")).toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    expect(screen.queryByText("connected clients")).not.toBeInTheDocument();
  });
  it("handles optional interfaces and missing uptime", () => {
    const { rerender } = render(
      <NetworkStrip
        now={now}
        data={data([
          device({ kind: "switch", ports: null, cpu: null, memory: null, uptime: null }),
        ])}
      />,
    );
    expect(screen.getByText("— / —")).toBeInTheDocument();
    expect(screen.getByText(/— uptime/)).toBeInTheDocument();
    rerender(<NetworkStrip now={now} data={data([device({ kind: "ap", radios: null })])} />);
    expect(screen.getByText("wireless clients")).toBeInTheDocument();
    rerender(<NetworkStrip now={now} data={{ ...data([]), devices: null }} />);
    expect(screen.getByRole("region", { name: "UniFi network" })).toBeEmptyDOMElement();
    expect(uptime(null)).toBe("—");
  });
  it("uses the compact header and removes the offline footer without hiding live machines", () => {
    render(
      <Dashboard
        now={now}
        fleet={{ host: { online: true, metrics: metrics() }, sleeping: { online: false } }}
        config={{ title: "Homelab", networkEnabled: true, hideOfflineFooter: true }}
        network={data([device({ name: "Gateway" })])}
      />,
    );
    expect(screen.getByText("Homelab / live system overview")).toHaveClass("eyebrow");
    expect(screen.queryByRole("heading", { name: "Machines" })).not.toBeInTheDocument();
    expect(screen.queryByText("sleeping")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Machines" })).getByRole("article"),
    ).toBeInTheDocument();
  });
});

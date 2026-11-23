import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { loadHistories, saveHistories, pruneHistories } from "./history";
import { scanEstimate } from "./scan";
import { HeaderAlerts, collectAlerts } from "./components/HeaderAlerts";
import { LlmStatus } from "./components/LlmStatus";
import { NetworkStrip } from "./components/NetworkStrip";
import { MachineCard } from "./components/MachineCard";
import { appendHistory, appendNetworkHistory } from "./fleet";
import { chartPath } from "./components/HistoryChart";
import { metrics, now } from "./test-fixtures";
import type { UnifiDevice, UnifiSnapshot, Zfs, Fleet } from "./types";
const device = (extra: Partial<UnifiDevice> = {}): UnifiDevice => ({
  id: "gw",
  name: "Gateway",
  kind: "gateway",
  state: "ONLINE",
  timestamp: now,
  extraTimestamp: now,
  cpu: 0,
  memory: 20,
  uptime: 90,
  ports: [],
  radios: [],
  clients: 1,
  ...extra,
});
const network = (devices: UnifiDevice[] = []): UnifiSnapshot => ({
  available: true,
  timestamp: now,
  devices,
  clients: 1,
  wired: 1,
  wireless: 0,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});
describe("persistent history", () => {
  it("survives a new client, removes expired/future/invalid points and stores only readings", () => {
    expect(loadHistories(now)).toEqual({});
    saveHistories(
      {
        host: [
          { t: now - 121, cpu: 1 },
          { t: now, cpu: 0, rx: 3 },
          { t: now + 6, cpu: 10 },
        ],
      },
      now,
    );
    expect(loadHistories(now)).toEqual({ host: [{ t: now, cpu: 0, gpu: null, rx: 3, tx: null }] });
    expect(loadHistories(now + 130)).toEqual({});
    expect(
      pruneHistories(
        {
          host: [null, { t: now, rx: -1 }, { t: now - 1, tx: 3 }, { t: now, cpu: 2 }],
          bad: "no",
          constructor: [],
        },
        now,
      ).host,
    ).toEqual([
      { t: now - 1, cpu: null, gpu: null, rx: null, tx: 3 },
      { t: now, cpu: 2, gpu: null, rx: null, tx: null },
    ]);
    for (const bad of [null, [], 3, "bad"]) expect(pruneHistories(bad, now)).toEqual({});
  });
  it("tolerates corrupt, oversized and unavailable storage", () => {
    localStorage.setItem("fleet-monitor.history.v1", "broken");
    expect(loadHistories(now)).toEqual({});
    localStorage.setItem("fleet-monitor.history.v1", "x".repeat(2_000_001));
    expect(loadHistories(now)).toEqual({});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("blocked");
    });
    expect(loadHistories(now)).toEqual({});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("full");
    });
    expect(() => saveHistories({}, now)).not.toThrow();
  });
  it("keeps WAN directions and real zero separate, deduplicates heartbeats, and breaks gaps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    const n = network([
      device({
        wan: [
          { up: true, "rx_bytes-r": 2000, "tx_bytes-r": 0 },
          { up: false, "rx_bytes-r": 500, "tx_bytes-r": 500 },
        ],
      }),
      device({ id: "sw", kind: "switch" }),
      device({ id: "old", extraTimestamp: now - 91 }),
    ]);
    const h = appendNetworkHistory({ host: [{ t: now, cpu: 10 }] }, n);
    expect(h.host).toBeUndefined();
    expect(
      appendHistory(h, { host: { online: true, metrics: metrics() } })["wan:gw"],
    ).toBeUndefined();
    expect(h["wan:gw"]).toEqual([{ t: now, rx: 2000, tx: 0 }]);
    expect(appendNetworkHistory(h, n)["wan:gw"]).toHaveLength(1);
    expect(appendNetworkHistory({}, { ...n, available: false })).toEqual({});
    expect(appendNetworkHistory({}, network())).toEqual({});
    expect(appendNetworkHistory({}, network([device({ wan: null })]))["wan:gw"][0].rx).toBeNull();
    expect(
      appendNetworkHistory(
        {},
        network([device({ wan: [{ up: true, "rx_bytes-r": null, "tx_bytes-r": 2 }] })]),
      )["wan:gw"][0].rx,
    ).toBeNull();
    expect(
      chartPath(
        [
          { t: now - 121, cpu: 10 },
          { t: now - 60, cpu: 20 },
          { t: now, cpu: 5 },
          { t: now + 2, cpu: 5 },
        ],
        "cpu",
        100,
        10,
        now,
      ),
    ).toBe("M300.0,78.8 M600.0,93.2 ");
  });
});
describe("ZFS estimates", () => {
  const z: Zfs = {
    available: true,
    timestamp: now,
    scan: {
      state: "SCANNING",
      function: "RESILVER",
      pass_start: now - 100,
      issued_bytes_per_scan: 2e9,
      to_examine: 10e9,
      skipped: 1e9,
      issued: 8e9,
      processed: 1,
    },
  };
  it("uses issued bytes, skipped bytes and active pass time", () => {
    expect(scanEstimate(z)).toBe("19.1 MiB/s · ~1m remaining");
    expect(scanEstimate({ ...z, scan: { ...z.scan, issued: 1e9 } })).toContain("~7m");
    expect(scanEstimate({ ...z, scan: { ...z.scan, to_examine: 100e9 } })).toContain("h ");
    expect(
      scanEstimate({ ...z, scan: { ...z.scan, function: "SCRUB", scrub_spent_paused: 50 } }),
    ).toContain("38.1 MiB/s");
  });
  it("does not invent ETA for paused, missing, stopped or slow scans", () => {
    expect(scanEstimate({ available: true })).toBe("");
    expect(scanEstimate({ ...z, scan: { state: "FINISHED" } })).toBe("");
    expect(scanEstimate({ ...z, scan: { ...z.scan, scrub_pause: 1 } })).toBe("Paused");
    expect(scanEstimate({ ...z, timestamp: undefined })).toBe("Estimate unavailable");
    expect(scanEstimate({ ...z, scan: { ...z.scan, pass_start: now } })).toBe("Estimating…");
    expect(scanEstimate({ ...z, scan: { ...z.scan, issued_bytes_per_scan: 0 } })).toBe(
      "Estimating…",
    );
    for (const extra of [
      { issued_bytes_per_scan: 1 },
      { to_examine: null },
      { issued: null },
      { issued: 20e9 },
      { processed: 0 },
      { function: "SCRUB", issued: 0 },
    ])
      expect(scanEstimate({ ...z, scan: { ...z.scan, ...extra } })).toContain("estimating…");
  });
});
describe("header alerts", () => {
  it("stays empty for healthy hosts and explicitly ignores unmonitored offline machines", () => {
    expect(
      collectAlerts(
        { host: { online: true, metrics: metrics() }, sleeping: { online: false } },
        {},
        now,
      ),
    ).toEqual([]);
    const { container } = render(<HeaderAlerts alerts={[]} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("prioritizes failures, identifies stale telemetry and rotates overflow without touching the clock", () => {
    const d = metrics();
    d.disk = { ...d.disk, percent: 99, free: 1024 };
    d.cpu.temperature = 95;
    d.gpu = { name: "GPU", temperature: 90 };
    d.services = { App: false, Other: true };
    d.llm = {
      available: false,
      timestamp: 0,
      model: "",
      active: null,
      queued: null,
      tokensPerSecond: null,
    };
    d.zfs = {
      available: true,
      timestamp: now,
      state: "DEGRADED",
      data_errors: 1,
      drives: [
        { name: "one", state: "ONLINE", temperature: 55 },
        { name: "two", state: "ONLINE", temperature: 46 },
      ],
    };
    const fleet: Fleet = {
      host: { online: true, metrics: d },
      stale: { online: true, metrics: { ...metrics(), timestamp: now - 20 } },
      expected: { online: false },
    };
    const alerts = collectAlerts(
      fleet,
      { alertHosts: ["expected", "missing"], networkEnabled: true },
      now,
      undefined,
      true,
    );
    expect(alerts.map((a) => a.text)).toEqual(
      expect.arrayContaining([
        "Telemetry connection lost",
        "host · CPU 95°C",
        "host · GPU 90°C",
        "host · 1.0 KiB free",
        "host · App unavailable",
        "host · ZFS degraded",
        "host · ZFS data errors",
        "host · 2 hot drives",
        "expected · telemetry unavailable",
        "missing · telemetry unavailable",
        "stale · telemetry unavailable",
        "UniFi telemetry unavailable",
      ]),
    );
    expect(alerts[0].critical).toBe(true);
    const { rerender } = render(<HeaderAlerts alerts={alerts} now={0} />);
    const first = screen.getByRole("status").textContent;
    rerender(<HeaderAlerts alerts={alerts} now={8} />);
    expect(screen.getByRole("status").textContent).not.toBe(first);
    rerender(<HeaderAlerts alerts={[{ id: "x", text: "Disk full", critical: true }]} now={0} />);
    expect(screen.getByText("1 alert")).toBeInTheDocument();
  });
  it("covers ZFS freshness and temperature thresholds, service recovery and network failures", () => {
    const host = (zfs: Zfs) => ({ host: { online: true, metrics: { ...metrics(), zfs } } });
    expect(collectAlerts(host({ available: false }), {}, now)[0].text).toContain(
      "ZFS telemetry unavailable",
    );
    expect(collectAlerts(host({ available: true, timestamp: now - 36 }), {}, now)).toHaveLength(1);
    expect(
      collectAlerts(
        host({
          available: true,
          timestamp: now,
          state: "ONLINE",
          drives: [{ name: "d", state: "ONLINE", temperature: 45 }],
        }),
        {},
        now,
      )[0],
    ).toMatchObject({ text: "host · 1 hot drive", critical: false });
    expect(
      collectAlerts(host({ available: true, timestamp: now, state: "ONLINE" }), {}, now),
    ).toEqual([]);
    const n = network([
      device({ state: "OFFLINE" }),
      device({ id: "old", name: "AP", timestamp: now - 91 }),
      device({ id: "ok" }),
    ]);
    expect(collectAlerts({}, { networkEnabled: true }, now, n).map((a) => a.text)).toEqual([
      "Gateway · offline",
      "AP · telemetry stale",
    ]);
    expect(collectAlerts({}, { networkEnabled: true }, now, network(), false, true)).toHaveLength(
      1,
    );
    expect(
      collectAlerts({}, { networkEnabled: true }, now, { ...network(), timestamp: now - 36 }),
    ).toHaveLength(1);
    expect(collectAlerts({}, { networkEnabled: true }, now, network())).toEqual([]);
  });
});
describe("compact additions", () => {
  const llm = {
    available: true,
    timestamp: now,
    model: "test-model",
    active: 1,
    queued: 0,
    tokensPerSecond: 38.6,
  };
  it("renders inference activity, idle speed labeling and unavailable readings", () => {
    const { rerender } = render(<LlmStatus llm={llm} now={now} services="T3 Code online" />);
    expect(screen.getByText("● Active")).toBeInTheDocument();
    expect(screen.getByText("test-model")).toBeInTheDocument();
    rerender(<LlmStatus llm={{ ...llm, active: 0 }} now={now} services="" />);
    expect(screen.getByText("● Idle")).toBeInTheDocument();
    expect(screen.getByText("tok/s last")).toBeInTheDocument();
    rerender(
      <LlmStatus llm={{ ...llm, active: null, tokensPerSecond: null }} now={now} services="" />,
    );
    expect(screen.getByText("tok/s")).toBeInTheDocument();
    rerender(<LlmStatus llm={llm} now={now + 21} services="" />);
    expect(screen.getByText("Inference telemetry unavailable")).toBeInTheDocument();
    rerender(<LlmStatus llm={{ ...llm, available: false }} now={now} services="" />);
    expect(screen.getByText("Inference telemetry unavailable")).toBeInTheDocument();
  });
  it("adds the detected Mac model beside its chip and places LLM status in the service row", () => {
    render(
      <MachineCard
        name="desktop"
        metrics={{ ...metrics(), hardware_model: "Mac mini", llm }}
        now={now}
      />,
    );
    expect(screen.getByText(/Mac mini ·/)).toBeInTheDocument();
    expect(screen.getByText("test-model").closest('[data-id="services"]')).toBeInTheDocument();
  });
  it("renders WAN byte rates and PoE watts, preserves zero and hides stale supplemental values", () => {
    const gw = device({ wan: [{ up: true, "rx_bytes-r": 2048, "tx_bytes-r": 0 }] });
    const sw = device({
      id: "sw",
      name: "Switch",
      kind: "switch",
      powerWatts: 17.6,
      powerBudgetWatts: 150,
      ports: [
        {
          idx: 1,
          state: "UP",
          connector: "RJ45",
          speedMbps: 1000,
          powerWatts: 2,
          poe: { state: "UP" },
        },
        {
          idx: 2,
          state: "DOWN",
          connector: "RJ45",
          speedMbps: null,
          powerWatts: 0,
          poe: { state: "DOWN" },
        },
        { idx: 9, state: "UP", connector: "SFPPLUS", speedMbps: 10000 },
      ],
    });
    const { rerender } = render(<NetworkStrip data={network([gw, sw])} now={now} />);
    expect(screen.getByText("↓ 2.0 KiB/s")).toBeInTheDocument();
    expect(screen.getByText("↑ 0 B/s")).toBeInTheDocument();
    expect(screen.getByText("17.6 / 150 W")).toBeInTheDocument();
    expect(screen.getByText("2.0 W")).toBeInTheDocument();
    expect(screen.getByText("0.0 W")).toBeInTheDocument();
    rerender(
      <NetworkStrip
        data={network([
          { ...gw, extraTimestamp: now - 91 },
          { ...sw, extraTimestamp: now - 91 },
        ])}
        now={now}
      />,
    );
    expect(screen.getByText("WAN telemetry unavailable")).toBeInTheDocument();
    expect(screen.getByText("— / — W")).toBeInTheDocument();
    expect(screen.queryByText("2.0 W")).not.toBeInTheDocument();
    rerender(
      <NetworkStrip
        data={network([
          { ...gw, wan: null },
          { ...sw, powerBudgetWatts: 0, powerWatts: null },
        ])}
        now={now}
      />,
    );
    expect(screen.getByText("WAN telemetry unavailable")).toBeInTheDocument();
  });
});

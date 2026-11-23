import type { Histories } from "../types";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Dashboard } from "../App";
import { HistoryChart, chartPath } from "./HistoryChart";
import { GpuPanel } from "./GpuPanel";
import { BatteryStatus } from "./BatteryStatus";
import { ZfsPanel } from "./ZfsPanel";
import { appendHistory } from "../fleet";
import { now, metrics } from "../test-fixtures";
describe("fleet display", () => {
  it("retains stale known hosts and keeps unseen offline hosts compact", () => {
    render(
      <Dashboard
        now={now}
        fleet={{
          workstation: { online: true, metrics: metrics() },
          old: { online: true, metrics: { ...metrics(), timestamp: 900 } },
          sleeping: { online: false },
        }}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("sleeping")).toBeInTheDocument();
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 machines online")).toBeInTheDocument();
  });
  it("renders memory once, disk activity, temperatures and battery", () => {
    render(
      <Dashboard
        now={now}
        fleet={{
          laptop: {
            online: true,
            metrics: {
              ...metrics(),
              battery: {
                percent: 80,
                status: "Plugged in · not charging",
                plugged_in: true,
              },
            },
          },
        }}
      />,
    );
    expect(screen.getAllByText("Memory used")).toHaveLength(1);
    expect(screen.queryByText("RAM used / total")).not.toBeInTheDocument();
    expect(screen.getByText("Disk read / write")).toBeInTheDocument();
    expect(screen.getByText("1.0 KiB/s · 2.0 KiB/s")).toBeInTheDocument();
    expect(screen.getByLabelText("Battery")).toHaveTextContent("80% · Plugged in · not charging");
  });
  it("uses the featured column without moving the other cards", () => {
    const fleet = Object.fromEntries(
      ["a", "b", "c", "d", "nas"].map((name) => [name, { online: true, metrics: metrics() }]),
    );
    render(
      <Dashboard
        now={now}
        fleet={fleet}
        config={{ featuredHost: "nas", order: ["a", "b", "c", "d", "nas"] }}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "Machines" })).getAllByRole("article"),
    ).toHaveLength(4);
    expect(
      within(screen.getByRole("region", { name: "Featured machine" })).getByRole("article"),
    ).toHaveAttribute("aria-label", "nas machine");
  });
});
describe("graphs and GPU memory", () => {
  it("labels percentage and time axes", () => {
    render(<HistoryChart kind="cpu" history={[{ t: now, cpu: 20 }]} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("−2 min")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
  });
  it("labels network axes with the actual scale", () => {
    render(<HistoryChart kind="network" history={[{ t: now, rx: 2 * 1048576, tx: 1024 }]} />);
    expect(screen.getByText("2.0 MiB/s")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });
  it("breaks the line across missing samples and outages", () => {
    expect(
      chartPath(
        [
          { t: 1, cpu: 20 },
          { t: 2, cpu: null },
          { t: 3, cpu: 30 },
          { t: 20, cpu: 50 },
        ],
        "cpu",
        100,
      ).match(/M/g),
    ).toHaveLength(3);
  });
  it("shows VRAM used and total without treating unknown usage as zero", () => {
    const { rerender } = render(<GpuPanel gpu={metrics().gpu} />);
    expect(screen.getByText("VRAM used")).toBeInTheDocument();
    expect(screen.getByText("4.0 / 8.0 GiB")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "50");
    rerender(<GpuPanel gpu={{ name: "Intel GPU", kind: "integrated" }} />);
    expect(screen.getByText("Shared system RAM · usage unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
  it("does not add a battery to desktop machines", () => {
    const { container } = render(<BatteryStatus battery={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("bounds and deduplicates history without inventing GPU readings", () => {
    let h: Histories = {
      host: [
        { t: 1, cpu: 1 },
        { t: now - 1, cpu: 2 },
      ],
    };
    const fleet = {
      host: { online: true, metrics: { ...metrics(), gpu: null } },
    };
    h = appendHistory(h, fleet);
    expect(h.host).toHaveLength(2);
    expect(h.host.at(-1)?.gpu).toBeNull();
    expect(appendHistory(h, fleet).host).toHaveLength(2);
  });
});
describe("ZFS", () => {
  const z = {
    available: true,
    timestamp: now,
    name: "pool",
    state: "DEGRADED",
    raw_used: 90,
    raw_total: 100,
    data_errors: 0,
    scan: { state: "SCANNING", function: "RESILVER" },
    scan_percent: 95,
    drives: [
      {
        port: 2,
        name: "old",
        missing: 1,
        state: "CANT_OPEN",
        read_errors: 0,
        write_errors: 0,
        checksum_errors: 0,
      },
      {
        port: 2,
        name: "new",
        device: "sda",
        replacing: true,
        state: "ONLINE",
        size: 2 ** 40,
        read: 1024,
        write: 2048,
        iops: 20,
        busy: 90,
        temperature: 35,
        read_errors: 0,
        write_errors: 0,
        checksum_errors: 0,
      },
    ],
    datasets: [],
  };
  it("keeps the replaced drive, activity and colour semantics without ATA clutter", () => {
    render(<ZfsPanel zfs={z} now={now} />);
    expect(screen.getByText("MISSING")).toHaveClass("bad");
    expect(screen.getByText("ONLINE")).toHaveClass("good");
    expect(screen.getByText("90%")).toHaveClass("warn");
    expect(screen.queryByRole("columnheader", { name: "ATA" })).not.toBeInTheDocument();
    expect(screen.getByText("2.0 KiB")).toHaveClass("write-rate");
    expect(screen.getByRole("meter", { name: "Rebuild progress" })).toHaveAttribute(
      "aria-valuenow",
      "95",
    );
  });
  it("does not show old pool readings as current", () => {
    render(<ZfsPanel zfs={{ ...z, timestamp: 900 }} now={now} />);
    expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

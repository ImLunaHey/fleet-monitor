import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BatteryStatus } from "./BatteryStatus";
import { GpuPanel } from "./GpuPanel";
import { MachineCard } from "./MachineCard";
import { HistoryChart, chartPath } from "./HistoryChart";
import { Meter, MetricTile, StatRow } from "./Primitives";
import { ZfsPanel } from "./ZfsPanel";
import { now, metrics } from "../test-fixtures";
import type { Drive, Zfs } from "../types";

describe("shared display components", () => {
  it("renders tile units and status tones", () => {
    render(
      <>
        <MetricTile label="Memory" value="8" unit="/ 16 GiB" />
        <StatRow label="Health" tone="warn">
          Degraded
        </StatRow>
      </>,
    );
    expect(screen.getByText("/ 16 GiB")).toBeInTheDocument();
    expect(screen.getByText("Health")).toHaveClass("warn");
    expect(screen.getByText("Degraded")).toHaveClass("warn");
  });
  it.each([
    [-10, 0],
    [42, 42],
    [120, 100],
  ])("clamps meter %s to %s for visual and accessible values", (value, expected) => {
    render(<Meter label="Capacity" color="red" value={value} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", String(expected));
    expect(screen.getByRole("meter").firstElementChild).toHaveStyle({ width: `${expected}%` });
  });
});
describe("BatteryStatus", () => {
  it.each([undefined, null, { percent: null, status: "Unknown" }])(
    "hides missing battery readings (%s)",
    (battery) => {
      const { container } = render(<BatteryStatus battery={battery} />);
      expect(container).toBeEmptyDOMElement();
    },
  );
  it("warns on a low unplugged battery and formats remaining time", () => {
    const { rerender } = render(
      <BatteryStatus battery={{ percent: 15, status: "Discharging", minutes_remaining: 75 }} />,
    );
    expect(screen.getByLabelText("Battery")).toHaveClass("warn");
    expect(screen.getByText(/1h 15m remaining/)).toBeInTheDocument();
    rerender(
      <BatteryStatus
        battery={{
          percent: 15,
          status: "Charging",
          plugged_in: true,
          charging: true,
          minutes_remaining: 90,
        }}
      />,
    );
    expect(screen.getByLabelText("Battery")).not.toHaveClass("warn");
    expect(screen.getByText(/1h 30m to full/)).toBeInTheDocument();
  });
});
describe("GpuPanel", () => {
  it("shows inventory failure separately from an absent GPU", () => {
    const { rerender } = render(<GpuPanel />);
    expect(screen.getByText("GPU inventory unavailable")).toBeInTheDocument();
    expect(screen.getByText("Reading unavailable")).toBeInTheDocument();
    rerender(
      <GpuPanel
        gpu={{ name: "Virtual display", status: "absent", reason: "No physical adapter" }}
      />,
    );
    expect(screen.getByText("No hardware GPU")).toBeInTheDocument();
    expect(screen.getByText(/No physical adapter/)).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
  it("shows all available sensors and warns on full dedicated memory", () => {
    render(
      <GpuPanel
        gpu={{
          name: "NVIDIA GeForce Example",
          kind: "discrete",
          usage: 0,
          memory_used: 1000,
          memory_total: 1024,
          temperature: 60,
          core_clock: 1500,
          power: 50,
        }}
      />,
    );
    expect(screen.getByText("Example · 0% · 60°C · 50 W · 1500 MHz")).toBeInTheDocument();
    expect(screen.getByText("VRAM used")).toHaveClass("warn");
  });
  it("distinguishes reserved UMA from shared system RAM and invalid capacity", () => {
    const { rerender } = render(
      <GpuPanel
        gpu={{
          name: "AMD",
          kind: "integrated",
          memory_label: "Reserved UMA",
          memory_used: 512,
          memory_total: 1024,
        }}
      />,
    );
    expect(screen.getByRole("meter", { name: "Reserved GPU memory" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    rerender(
      <GpuPanel
        gpu={{ name: "Apple", kind: "integrated", memory_used: 1024, memory_total: 8192 }}
      />,
    );
    expect(screen.getByRole("meter", { name: "GPU shared memory" })).toHaveAttribute(
      "aria-valuenow",
      "12.5",
    );
    rerender(<GpuPanel gpu={{ name: "Unknown", memory_used: 0, memory_total: 0 }} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
describe("HistoryChart", () => {
  it("renders a continuous bounded line and handles empty history", () => {
    expect(chartPath([], "cpu", 100)).toBe("");
    expect(
      chartPath(
        [
          { t: 1, cpu: -1 },
          { t: 2, cpu: 150 },
        ],
        "cpu",
        100,
      ),
    ).toBe("M595.0,98.0 L600.0,2.0 ");
  });
  it.each([
    [1024, "1.0 KiB/s"],
    [2 ** 30, "1.0 GiB/s"],
  ])("scales network rate %s", (rx, label) => {
    render(
      <HistoryChart
        kind="network"
        history={[{ t: now, rx }]}
        network={{ download: rx, upload: 0 }}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(/↑ 0 B\/s/)).toBeInTheDocument();
  });
  it("shows a GPU outage without inventing samples", () => {
    render(<HistoryChart kind="gpu" unavailable="Sensor unavailable" />);
    expect(screen.getByText("Sensor unavailable")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "gpu over the last two minutes");
  });
});
describe("MachineCard", () => {
  it.each([
    [85, "warn"],
    [95, "bad"],
  ])("marks disk pressure at %s percent", (percent, tone) => {
    render(
      <MachineCard
        name="host"
        now={now}
        metrics={{
          ...metrics(),
          disk: { ...metrics().disk, percent, read: null, iops: null },
          cpu: { usage: 0, temperature: null },
          gpu: { name: "None", status: "absent" },
          services: { API: true, Worker: false },
        }}
      />,
    );
    expect(screen.getByText("Disk space")).toHaveClass(tone);
    expect(screen.getAllByText("Reading unavailable")).toHaveLength(2);
    expect(screen.getAllByText("No hardware GPU")).toHaveLength(2);
    expect(screen.getByText("API online · Worker unavailable")).toBeInTheDocument();
  });
  it("shows a GPU failure reason and preserves normal service fallback", () => {
    render(
      <MachineCard
        name="host"
        now={now}
        metrics={{ ...metrics(), gpu: { name: "GPU", reason: "Driver offline" } }}
      />,
    );
    expect(screen.getAllByText(/Driver offline/)).toHaveLength(2);
    expect(screen.getByText("Live hardware telemetry")).toBeInTheDocument();
  });
  it("uses the featured ZFS panel in place of local disk details", () => {
    render(
      <MachineCard
        name="nas"
        now={now}
        featured
        metrics={{ ...metrics(), gpu: null, zfs: { available: false } }}
      />,
    );
    expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Disk space")).not.toBeInTheDocument();
  });
});
const drive = (extra: Partial<Drive> = {}): Drive => ({
  name: "ata-Example_SERIAL123",
  device: "sda",
  port: 1,
  state: "ONLINE",
  read_errors: 0,
  write_errors: 0,
  checksum_errors: 0,
  ...extra,
});
const pool = (extra: Partial<Zfs> = {}): Zfs => ({
  available: true,
  timestamp: now,
  name: "pool",
  state: "ONLINE",
  raw_used: 50,
  raw_total: 100,
  data_errors: 0,
  drives: [drive()],
  datasets: [{ name: "pool", used: 10, available: 20 }],
  ...extra,
});
describe("ZfsPanel", () => {
  it("aligns device, full serial, and replacement indicator in separate columns", () => {
    render(
      <ZfsPanel
        now={now}
        zfs={pool({
          drives: [
            drive({ name: "old", device: undefined, missing: 1, state: "CANT_OPEN" }),
            drive({ replacing: true, path: "/dev/disk/by-id/ata-Example_SERIAL123-part1" }),
          ],
        })}
      />,
    );
    const table = screen.getByRole("table", { name: "ZFS drives" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .slice(0, 5)
        .map((h) => h.textContent),
    ).toEqual(["ATA", "Device", "Drive ID", "↻", "State"]);
    const replacement = screen.getByLabelText("Replacement drive");
    const row = replacement.closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row!).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(/^sda$/);
    expect(cells[2]).toHaveTextContent(/^SERIAL123$/);
    expect(cells[3]).toContainElement(replacement);
    expect(screen.getByTitle("ata-Example_SERIAL123")).toBeInTheDocument();
    expect(screen.getByText("10 B / 30 B")).toBeInTheDocument();
  });
  it.each([
    [44, "good"],
    [45, "warn"],
    [54, "warn"],
    [55, "bad"],
  ])("colours a %s°C drive %s", (temperature, tone) => {
    render(<ZfsPanel now={now} zfs={pool({ drives: [drive({ temperature })] })} />);
    expect(screen.getByText(String(temperature))).toHaveClass(tone);
  });
  it("shows errors, sorts ports, and preserves missing temperature as unknown", () => {
    render(
      <ZfsPanel
        now={now}
        zfs={pool({
          data_errors: 2,
          read_errors: 1,
          scan: { state: "FINISHED" },
          drives: [
            drive({ port: 3, read_errors: 2, busy: 20 }),
            drive({ port: 2, name: "other", device: "sdb" }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/2 known data errors/)).toHaveClass("bad");
    expect(screen.getByText("2/0/0")).toHaveClass("bad");
    expect(screen.getByText("FINISHED")).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "ZFS drives" })).getAllByRole("row");
    expect(within(rows[1]).getAllByRole("cell")[0]).toHaveTextContent("2");
    expect(within(rows[1]).getAllByRole("cell")[6]).toHaveTextContent("—");
  });
  it("handles absent optional pool fields and unknown totals", () => {
    render(<ZfsPanel now={now} zfs={{ available: true, timestamp: now, state: "ONLINE" }} />);
    expect(screen.getByText("No scan")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText(/— known data errors/)).toBeInTheDocument();
  });
  it("handles an entirely absent pool", () => {
    render(<ZfsPanel now={now} />);
    expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
  });
});

it("shows measured Intel client RAM without inventing a fixed VRAM capacity", () => {
  render(
    <GpuPanel
      gpu={{
        name: "Intel",
        kind: "integrated",
        memory_label: "GPU client RAM",
        memory_used: 0,
        memory_note: "GPU client RAM · excludes kernel buffers",
      }}
    />,
  );
  expect(screen.getByText("GPU client RAM")).toBeInTheDocument();
  expect(screen.getByText("0 B used · shared system RAM")).toBeInTheDocument();
  expect(screen.queryByRole("meter")).not.toBeInTheDocument();
});

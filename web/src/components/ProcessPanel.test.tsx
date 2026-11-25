import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessPanel } from "./ProcessPanel";
import { MachineCard } from "./MachineCard";
import { metrics, now } from "../test-fixtures";
import type { Metrics } from "../types";
function sample(): Metrics {
  return {
    ...metrics(),
    memory: { used: 52 * 2 ** 30, total: 64 * 2 ** 30, available: 12 * 2 ** 30, swap_used: 0 },
    processes: {
      available: true,
      timestamp: now,
      cpu_ready: true,
      memory: [
        { pid: 10, name: "Chrome", rss: 6 * 2 ** 30, cpu: 1 },
        { pid: 11, name: "Chrome", rss: 3 * 2 ** 30, cpu: null },
      ],
      cpu: [{ pid: 20, name: "ffmpeg", rss: 2 ** 30, cpu: 25 }],
      arc: { size: 28 * 2 ** 30, limit: 32 * 2 ** 30 },
    },
  };
}
describe("ProcessPanel", () => {
  it("shows both ranked lists, PID identities, and separate ARC/available/swap without controls", () => {
    render(<ProcessPanel metrics={sample()} now={now} />);
    expect(
      within(screen.getByRole("region", { name: "Top memory processes" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(screen.getByText("#10")).toBeInTheDocument();
    expect(screen.getByText("#11")).toBeInTheDocument();
    expect(screen.getByText("6.0 GiB")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("28.0 GiB")).toBeInTheDocument();
    expect(screen.getByText("12.0 GiB")).toBeInTheDocument();
    expect(screen.getByText("0 B")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it.each([
    undefined,
    null,
    { ...sample().processes!, available: false },
    { ...sample().processes!, timestamp: now - 16 },
  ])("does not present missing, failed or stale data as zero: %s", (processes) => {
    render(<ProcessPanel metrics={{ ...sample(), processes }} now={now} />);
    expect(screen.getByText("Process telemetry unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Chrome")).not.toBeInTheDocument();
  });
  it("distinguishes warming up, idle, unreadable processes and partial visibility", () => {
    const d = sample();
    d.processes = {
      ...d.processes!,
      cpu_ready: false,
      cpu: [],
      memory: [],
      partial: true,
      arc: null,
    };
    d.zfs = { available: true };
    const { rerender } = render(<ProcessPanel metrics={d} now={now} />);
    expect(screen.getByText("Measuring CPU…")).toBeInTheDocument();
    expect(screen.getByText("No readable memory usage")).toBeInTheDocument();
    expect(screen.getByText("Some processes hidden")).toBeInTheDocument();
    expect(screen.getByText("ARC unavailable")).toBeInTheDocument();
    d.processes.cpu_ready = true;
    rerender(<ProcessPanel metrics={d} now={now} />);
    expect(screen.getByText("No CPU activity")).toBeInTheDocument();
  });
  it("does not show ARC on non-ZFS machines and limits each list to three rows", () => {
    const d = sample();
    d.processes!.arc = null;
    d.processes!.memory = Array.from({ length: 5 }, (_, i) => ({
      pid: i,
      name: "worker",
      rss: 1024,
      cpu: 0,
    }));
    render(<ProcessPanel metrics={d} now={now} />);
    expect(screen.queryByText(/ARC/)).not.toBeInTheDocument();
    expect(screen.getAllByText("worker")).toHaveLength(3);
  });
  it("preserves legacy host cards and adds a dedicated row only when the agent supplies the field", () => {
    const { rerender } = render(<MachineCard name="host" metrics={metrics()} now={now} />);
    expect(screen.queryByRole("region", { name: "Top processes" })).not.toBeInTheDocument();
    rerender(<MachineCard name="host" metrics={sample()} now={now} />);
    expect(screen.getByRole("article")).toHaveClass("with-processes");
    expect(screen.getByRole("region", { name: "Top processes" })).toBeInTheDocument();
  });
});

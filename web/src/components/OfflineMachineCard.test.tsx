import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OfflineMachineCard, elapsedLabel } from "./OfflineMachineCard";
import { Dashboard } from "../App";
import { retainMetrics, appendHistory } from "../fleet";
import { metrics, now } from "../test-fixtures";
import type { Fleet } from "../types";

describe("offline machines", () => {
  it.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [60, "1 minute"],
    [180, "3 minutes"],
    [3600, "1 hour"],
    [7200, "2 hours"],
    [86400, "1 day"],
    [172800, "2 days"],
  ])("formats %s seconds as %s", (seconds, label) => {
    expect(elapsedLabel(Number(seconds))).toBe(label);
  });
  it("retains identity and history across loss and restores current readings on recovery", () => {
    const original: Fleet = {
      comet: { online: true, metrics: { ...metrics(), hardware_model: "MacBook Pro" } },
    };
    const history = appendHistory({}, original);
    const lost = retainMetrics(original, { comet: { online: false } });
    expect(lost.comet.online).toBe(false);
    expect(lost.comet.metrics).toEqual(original.comet.metrics);
    expect(appendHistory(history, lost)).toEqual(history);
    const config = { order: ["comet"], hideOfflineFooter: true };
    const { rerender } = render(
      <Dashboard fleet={original} config={config} now={now} histories={history} />,
    );
    expect(screen.getByText("Memory used")).toBeInTheDocument();
    rerender(<Dashboard fleet={lost} config={config} now={now + 180} histories={history} />);
    const card = screen.getByRole("article", { name: "comet machine" });
    expect(card).toHaveClass("offline-machine");
    expect(within(card).getByText(/MacBook Pro/)).toBeInTheDocument();
    expect(within(card).getByText("3 minutes")).toBeInTheDocument();
    expect(within(card).queryByText("Memory used")).not.toBeInTheDocument();
    expect(within(card).queryByText("Now")).not.toBeInTheDocument();
    expect(card.querySelector(".chart-box.network > .row")).toBeNull();
    const paths = [...card.querySelectorAll("path.line")].map((p) => p.getAttribute("d"));
    rerender(<Dashboard fleet={lost} config={config} now={now + 3600} histories={history} />);
    expect(
      [...screen.getByRole("article").querySelectorAll("path.line")].map((p) =>
        p.getAttribute("d"),
      ),
    ).toEqual(paths);
    const recovered = retainMetrics(lost, {
      comet: { online: true, metrics: { ...metrics(), timestamp: now + 3600 } },
    });
    rerender(
      <Dashboard
        fleet={recovered}
        config={config}
        now={now + 3600}
        histories={appendHistory(history, recovered)}
      />,
    );
    expect(screen.getByRole("article")).not.toHaveClass("offline-machine");
    expect(screen.getByText("Memory used")).toBeInTheDocument();
    expect(screen.queryByText("Stopped updating")).not.toBeInTheDocument();
  });
  it("keeps four-card ordering and the featured host during an outage", () => {
    const fleet: Fleet = Object.fromEntries(
      ["a", "b", "c", "d", "nas"].map((name) => [name, { online: true, metrics: metrics() }]),
    );
    const order = ["a", "b", "c", "d", "nas"];
    const { rerender } = render(
      <Dashboard now={now} fleet={fleet} config={{ order, featuredHost: "nas" }} />,
    );
    const names = () =>
      within(screen.getByRole("region", { name: "Machines" }))
        .getAllByRole("article")
        .map((a) => a.getAttribute("aria-label"));
    const before = names();
    rerender(
      <Dashboard
        now={now + 60}
        fleet={retainMetrics(fleet, { ...fleet, b: { online: false }, nas: { online: false } })}
        config={{ order, featuredHost: "nas" }}
      />,
    );
    expect(names()).toEqual(before);
    expect(
      within(screen.getByRole("region", { name: "Featured machine" })).getByRole("article"),
    ).toHaveClass("offline-machine");
  });
  it("shows expected hosts on initial load without manufacturing last-seen data", () => {
    render(
      <Dashboard
        now={now}
        fleet={{}}
        config={{ order: ["comet"], alertHosts: ["comet"], hideOfflineFooter: true }}
      />,
    );
    expect(screen.getByRole("article", { name: "comet machine" })).toBeInTheDocument();
    expect(screen.getByText("No telemetry received yet.")).toBeInTheDocument();
    expect(screen.getByText("No recorded activity available.")).toBeInTheDocument();
  });
  it("does not resurrect removed peers or treat incomplete responses as live", () => {
    const original = {
      removed: { online: true, metrics: metrics() },
      retained: { online: true, metrics: metrics() },
    };
    const next = retainMetrics(original, {
      retained: { online: true },
      neverSeen: { online: false },
    });
    expect(next.removed).toBeUndefined();
    expect(next.retained.online).toBe(false);
    expect(next.neverSeen.metrics).toBeUndefined();
  });
  it("does not infer missing history or timestamps", () => {
    const { rerender } = render(
      <OfflineMachineCard
        name="host"
        now={now}
        metrics={{ ...metrics(), timestamp: NaN }}
        history={[{ t: now - 1, cpu: null }]}
      />,
    );
    expect(screen.getAllByText("No recorded samples")).toHaveLength(3);
    expect(screen.getByText("No telemetry received yet.")).toBeInTheDocument();
    rerender(
      <OfflineMachineCard
        name="host"
        now={now}
        metrics={{ ...metrics(), timestamp: now + 100 }}
        history={[{ t: now + 100 }]}
      />,
    );
    expect(screen.getByText("No recorded activity available.")).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { driveSlot } from "./driveSlots";
import { ZfsPanel } from "./components/ZfsPanel";
import { Dashboard } from "./App";
import { metrics, now } from "./test-fixtures";
import type { Drive, Zfs } from "./types";
const drive = (serial: string, port = 6): Drive => ({
  name: `ata-Example_${serial}`,
  path: `/dev/disk/by-id/ata-Example_${serial}-part1`,
  port,
  state: "ONLINE",
});
const pool = (drives: Drive[]): Zfs => ({
  available: true,
  timestamp: now,
  state: "ONLINE",
  drives,
});
describe("physical drive slots", () => {
  it("matches stable serials and full IDs with explicit precedence", () => {
    const slots = { SERIAL: { slot: 2 }, "ata-Example_SERIAL": { slot: 7 } };
    expect(driveSlot(drive("SERIAL"), slots)?.slot).toBe(7);
    expect(driveSlot({ ...drive("SERIAL"), path: undefined }, { SERIAL: { slot: 2 } })?.slot).toBe(
      2,
    );
    expect(driveSlot(drive("OTHER"), slots)).toBeUndefined();
    expect(driveSlot(drive("toString"), {})).toBeUndefined();
    expect(
      driveSlot({ name: "plain-id", state: "ONLINE" }, { "plain-id": { slot: 3 } })?.slot,
    ).toBe(3);
  });
  it.each([0, -1, 2.5, NaN, Infinity])(
    "rejects invalid slot %s from non-Nix configuration",
    (slot) => {
      expect(driveSlot(drive("SERIAL"), { SERIAL: { slot } })).toBeUndefined();
    },
  );
  it("sorts physical slots, preserves ATA ports, and distinguishes unknown and inferred slots", () => {
    render(
      <ZfsPanel
        now={now}
        slots={{ A: { slot: 2 }, B: { slot: 6, inferred: true } }}
        zfs={pool([drive("B", 2), drive("UNKNOWN", 1), drive("A", 6)])}
      />,
    );
    const rows = within(screen.getByRole("table", { name: "ZFS drives" })).getAllByRole("row");
    expect(
      within(rows[0])
        .getAllByRole("columnheader")
        .slice(0, 2)
        .map((c) => c.textContent),
    ).toEqual(["Slot", "ATA"]);
    expect(
      rows.slice(1).map((r) =>
        within(r)
          .getAllByRole("cell")
          .slice(0, 2)
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ["2", "6"],
      ["6*", "2"],
      ["—", "1"],
    ]);
    expect(screen.getByTitle("Physical slot inferred, not visually confirmed")).toHaveTextContent(
      "6*",
    );
  });
  it("keeps both sides of a replacement in the same slot without assigning unknown drives", () => {
    render(
      <ZfsPanel
        now={now}
        slots={{ OLD: { slot: 5 }, NEW: { slot: 5 } }}
        zfs={pool([
          drive("NEW", 3),
          { ...drive("OLD", 3), missing: 1, state: "CANT_OPEN" },
          drive("UNKNOWN", 3),
        ])}
      />,
    );
    const rows = within(screen.getByRole("table", { name: "ZFS drives" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["5", "5", "—"]);
    expect(within(rows[0]).getByText("OLD")).toBeInTheDocument();
  });
  it("passes only the featured host's configured mapping through the dashboard", () => {
    render(
      <Dashboard
        now={now}
        fleet={{ lake: { online: true, metrics: { ...metrics(), zfs: pool([drive("A")]) } } }}
        config={{
          featuredHost: "lake",
          driveSlots: { lake: { A: { slot: 2 } }, other: { A: { slot: 9 } } },
        }}
      />,
    );
    expect(screen.getByTitle("Physical enclosure slot")).toHaveTextContent("2");
  });
  it("does not invent physical slots for an unconfigured host", () => {
    render(<ZfsPanel now={now} zfs={pool([drive("A")])} />);
    expect(screen.queryByRole("columnheader", { name: "Slot" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ATA" })).toBeInTheDocument();
  });
});

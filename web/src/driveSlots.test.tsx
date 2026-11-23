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
  it("maps the ATA port regardless of drive identity or device name", () => {
    const slots = { "6": { slot: 2 } };
    expect(driveSlot(drive("OLD"), slots)?.slot).toBe(2);
    expect(driveSlot({ ...drive("NEW"), device: "sdz", path: undefined }, slots)?.slot).toBe(2);
    expect(driveSlot(drive("OLD", 1), slots)).toBeUndefined();
    expect(driveSlot(drive("OLD"), {})).toBeUndefined();
    expect(driveSlot(drive("OLD"), { OLD: { slot: 7 } })).toBeUndefined();
  });
  it.each([undefined, null, 0, -1, 1.5, NaN, Infinity])(
    "keeps missing or invalid ATA port %s unknown",
    (port) => {
      expect(driveSlot({ ...drive("A"), port }, { "6": { slot: 2 } })).toBeUndefined();
    },
  );
  it.each([0, -1, 2.5, NaN, Infinity])(
    "rejects invalid slot %s from non-Nix configuration",
    (slot) => {
      expect(driveSlot(drive("SERIAL"), { "6": { slot } })).toBeUndefined();
    },
  );
  it("sorts physical slots, hides the ATA column, and leaves unmapped slots unknown", () => {
    render(
      <ZfsPanel
        now={now}
        slots={{ "6": { slot: 2 }, "2": { slot: 6 } }}
        zfs={pool([drive("B", 2), drive("UNKNOWN", 1), drive("A", 6)])}
      />,
    );
    const rows = within(screen.getByRole("table", { name: "ZFS drives" })).getAllByRole("row");
    expect(
      within(rows[0])
        .getAllByRole("columnheader")
        .slice(0, 2)
        .map((c) => c.textContent),
    ).toEqual(["Slot", "Device"]);
    expect(
      rows.slice(1).map((r) =>
        within(r)
          .getAllByRole("cell")
          .slice(0, 2)
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ["2", "—"],
      ["6", "—"],
      ["—", "—"],
    ]);
    expect(screen.queryByText("6*")).not.toBeInTheDocument();
  });
  it("keeps replacement drives in the same physical slot without adding their serials", () => {
    render(
      <ZfsPanel
        now={now}
        slots={{ "3": { slot: 5 } }}
        zfs={pool([
          drive("NEW", 3),
          { ...drive("OLD", 3), missing: 1, state: "CANT_OPEN" },
          drive("UNKNOWN", 4),
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
          driveSlots: { lake: { "6": { slot: 2 } }, other: { "6": { slot: 9 } } },
        }}
      />,
    );
    expect(screen.getByTitle("Physical enclosure slot")).toHaveTextContent("2");
  });
  it("does not invent physical slots for an unconfigured host", () => {
    render(<ZfsPanel now={now} zfs={pool([drive("A")])} />);
    expect(screen.queryByRole("columnheader", { name: "Slot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "ATA" })).not.toBeInTheDocument();
  });
});

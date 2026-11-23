import { driveSlot } from "../driveSlots";
import { scanEstimate } from "../scan";
import type { ReactNode, CSSProperties } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Drive, Dataset, Zfs, DriveSlots } from "../types";
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import { bytes, colors, finite, fmt, fresh } from "../format";
import { StatRow, Meter } from "./Primitives";
function DataTable<T>({
  columns,
  data,
  label,
}: {
  columns: ColumnDef<T>[];
  data: T[];
  label: string;
}) {
  // React Compiler is not enabled; TanStack Table v8 is rendered directly here.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <table className="zfs-table" aria-label={label}>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((h) => (
              <th key={h.id} style={{ width: `${h.column.columnDef.size}%` }}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const column = <T,>(
  id: string,
  header: string,
  width: string,
  cell: (data: T) => ReactNode,
): ColumnDef<T> => ({
  id,
  header,
  accessorFn: (d) => d,
  cell: (info) => cell(info.row.original),
  size: Number.parseFloat(width),
});
const driveColumn = column<Drive>;
const datasetColumn = column<Dataset>;
const driveColumns = [
  driveColumn("port", "ATA", "4%", (d) => d.port ?? "—"),
  driveColumn("device", "Device", "6%", (d) => d.device || "—"),
  driveColumn("id", "Drive ID", "18%", (d) => {
    const id = (d.path || d.name).replace(/^.*\//, "").replace(/-part\d+$/, "");
    return <span title={id}>{id.split("_").at(-1) || id}</span>;
  }),
  driveColumn("replacement", "↻", "3%", (d) =>
    d.replacing && !d.missing ? (
      <span aria-label="Replacement drive" title="Replacement drive" className="replacement">
        ↻
      </span>
    ) : null,
  ),
  driveColumn("state", "State", "9%", (d) => (
    <span className={`state-tag ${d.state === "ONLINE" ? "good" : "bad"}`}>
      {d.state === "CANT_OPEN" ? "MISSING" : d.state}
    </span>
  )),
  driveColumn("size", "Size", "9%", (d) => bytes(d.size)),
  driveColumn("temperature", "°C", "5%", (d) => (
    <span
      className={
        finite(d.temperature)
          ? d.temperature >= 55
            ? "bad"
            : d.temperature >= 45
              ? "warn"
              : "good"
          : ""
      }
    >
      {fmt(d.temperature)}
    </span>
  )),
  driveColumn("read", "Read/s", "9%", (d) => <span className="read-rate">{bytes(d.read)}</span>),
  driveColumn("write", "Write/s", "10%", (d) => (
    <span className="write-rate">{bytes(d.write)}</span>
  )),
  driveColumn("iops", "IOPS", "7%", (d) => fmt(d.iops)),
  driveColumn("busy", "Busy", "8%", (d) =>
    finite(d.busy) ? (
      <span
        className={`busy-cell ${d.busy >= 80 ? "warn" : ""}`}
        style={{ "--fill": `${Math.min(100, d.busy)}%`, display: "block" } as CSSProperties}
      >
        {fmt(d.busy)}%
      </span>
    ) : (
      "—"
    ),
  ),
  driveColumn("errors", "R/W/CRC", "12%", (d) => (
    <span
      className={
        d.read_errors || d.write_errors || d.checksum_errors
          ? "bad"
          : d.state === "ONLINE"
            ? "good"
            : ""
      }
    >
      {[d.read_errors, d.write_errors, d.checksum_errors].map((n) => n ?? "—").join("/")}
    </span>
  )),
];
const datasetColumns = [
  datasetColumn("name", "Dataset", "38%", (d) => d.name),
  datasetColumn(
    "usage",
    "Used / total¹",
    "40%",
    (d) => `${bytes(d.used)} / ${bytes(d.used + d.available)}`,
  ),
  datasetColumn("free", "Free", "22%", (d) => bytes(d.available)),
];
export function ZfsPanel({
  zfs: z,
  now,
  slots = {},
}: {
  zfs?: Zfs;
  now: number;
  slots?: DriveSlots;
}) {
  if (!z?.available || !fresh(z.timestamp, now, 35))
    return (
      <div className="compact-zfs">
        <StatRow label="ZFS" tone="warn">
          Telemetry unavailable
        </StatRow>
      </div>
    );
  const root = z.datasets?.find((d) => d.name === z.name),
    drives = z.drives || [],
    healthy = drives.filter((d) => d.state === "ONLINE").length;
  const errors = (z.read_errors || 0) + (z.write_errors || 0) + (z.checksum_errors || 0),
    scan = z.scan || {};
  const mapped = Object.keys(slots).length > 0;
  const columns = mapped
    ? [
        driveColumn("slot", "Slot", "4%", (d) => {
          const location = driveSlot(d, slots);
          return location ? (
            <span
              title={
                location.inferred
                  ? "Physical slot inferred, not visually confirmed"
                  : "Physical enclosure slot"
              }
            >
              {location.slot}
              {location.inferred ? "*" : ""}
            </span>
          ) : (
            "—"
          );
        }),
        ...driveColumns.map((c) =>
          c.id === "id" || c.id === "errors" ? { ...c, size: c.size! - 2 } : c,
        ),
      ]
    : driveColumns;
  const sorted = [...drives].sort(
    (a, b) =>
      (driveSlot(a, slots)?.slot ?? Infinity) - (driveSlot(b, slots)?.slot ?? Infinity) ||
      (a.port ?? 99) - (b.port ?? 99) ||
      Number(!!b.missing) - Number(!!a.missing),
  );
  return (
    <div className="compact-zfs">
      <StatRow label={`ZFS ${z.state}`} tone={z.state !== "ONLINE" ? "warn" : ""}>
        {bytes(z.raw_used)} / {bytes(z.raw_total)} raw ·{" "}
        {fmt(
          finite(z.raw_used) && finite(z.raw_total) && z.raw_total > 0
            ? (z.raw_used / z.raw_total) * 100
            : null,
        )}
        %
      </StatRow>
      <StatRow label={scan.state === "SCANNING" ? "Rebuild / scrub" : "Last scan"}>
        {scan.state === "SCANNING" ? (
          <span className="scan-reading">
            <span>
              {fmt(z.scan_percent, 2)}% · {scan.function || ""}
            </span>
            <span className="scan-extra">{scanEstimate(z)}</span>
          </span>
        ) : (
          scan.state || "No scan"
        )}
      </StatRow>
      {scan.state === "SCANNING" && finite(z.scan_percent) && (
        <Meter
          label="Rebuild progress"
          value={z.scan_percent}
          color={colors.purple}
          className="scan-progress"
        />
      )}
      <StatRow label="Drive health" tone={drives.length > healthy || errors > 0 ? "warn" : ""}>
        {healthy} online · {drives.length - healthy} unavailable · {errors} I/O errors
      </StatRow>
      <StatRow label="Data integrity" tone={(z.data_errors ?? 0) > 0 ? "bad" : ""}>
        {z.data_errors ?? "—"} known data errors
        {root ? ` · ${bytes(root.used)} data used` : ""}
      </StatRow>
      <h3 className="section-heading">Drives · live activity &amp; health</h3>
      <DataTable label="ZFS drives" columns={columns} data={sorted} />
      <h3 className="section-heading">Datasets</h3>
      <DataTable label="ZFS datasets" columns={datasetColumns} data={z.datasets || []} />
      <p className="note">
        {mapped && "Slot = physical bay; — unmapped; * inferred. "}ATA = controller port. ↻
        replacement. R/W/CRC = errors. ¹ Dataset totals share free space; raw includes parity.
      </p>
    </div>
  );
}

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { bytes, colors, finite, fmt, fresh } from "../format";
import { StatRow, Meter } from "./Primitives";
function DataTable({ columns, data, label }) {
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
              <th key={h.id} style={{ width: h.column.columnDef.meta?.width }}>
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
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const column = (id, header, width, cell) => ({
  id,
  header,
  accessorFn: (d) => d,
  cell: (info) => cell(info.getValue()),
  meta: { width },
});
const driveColumns = [
  column("port", "Port", "5%", (d) => d.port ?? "—"),
  column(
    "drive",
    "Drive",
    "19%",
    (d) =>
      `${d.device || "removed"} · ${(d.path || d.name).replace("-part1", "").slice(-6)}${d.replacing && !d.missing ? " ↻" : ""}`,
  ),
  column("state", "State", "12%", (d) => (
    <span className={`state-tag ${d.state === "ONLINE" ? "good" : "bad"}`}>
      {d.state === "CANT_OPEN" ? "MISSING" : d.state}
    </span>
  )),
  column("size", "Size", "10%", (d) => bytes(d.size)),
  column("temperature", "°C", "5%", (d) => (
    <span className={d.temperature >= 45 ? "warn" : ""}>
      {fmt(d.temperature)}
    </span>
  )),
  column("read", "Read/s", "11%", (d) => (
    <span className="read-rate">{bytes(d.read)}</span>
  )),
  column("write", "Write/s", "11%", (d) => (
    <span className="write-rate">{bytes(d.write)}</span>
  )),
  column("iops", "IOPS", "7%", (d) => fmt(d.iops)),
  column("busy", "Busy", "7%", (d) =>
    finite(d.busy) ? (
      <span
        className={`busy-cell ${d.busy >= 80 ? "warn" : ""}`}
        style={{ "--fill": `${Math.min(100, d.busy)}%`, display: "block" }}
      >
        {fmt(d.busy)}%
      </span>
    ) : (
      "—"
    ),
  ),
  column("errors", "R/W/CRC", "13%", (d) => (
    <span
      className={
        d.read_errors || d.write_errors || d.checksum_errors
          ? "bad"
          : d.state === "ONLINE"
            ? "good"
            : ""
      }
    >
      {[d.read_errors, d.write_errors, d.checksum_errors]
        .map((n) => n ?? "—")
        .join("/")}
    </span>
  )),
];
const datasetColumns = [
  column("name", "Dataset", "38%", (d) => d.name),
  column(
    "usage",
    "Used / total¹",
    "40%",
    (d) => `${bytes(d.used)} / ${bytes(d.used + d.available)}`,
  ),
  column("free", "Free", "22%", (d) => bytes(d.available)),
];
export function ZfsPanel({ zfs: z, now }) {
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
  const errors =
      (z.read_errors || 0) + (z.write_errors || 0) + (z.checksum_errors || 0),
    scan = z.scan || {};
  const sorted = [...drives].sort(
    (a, b) =>
      (a.port ?? 99) - (b.port ?? 99) ||
      Number(!!b.missing) - Number(!!a.missing),
  );
  return (
    <div className="compact-zfs">
      <StatRow
        label={`ZFS ${z.state}`}
        tone={z.state !== "ONLINE" ? "warn" : ""}
      >
        {bytes(z.raw_used)} / {bytes(z.raw_total)} raw ·{" "}
        {fmt((z.raw_used / z.raw_total) * 100)}%
      </StatRow>
      <StatRow
        label={scan.state === "SCANNING" ? "Rebuild / scrub" : "Last scan"}
      >
        {scan.state === "SCANNING"
          ? `${fmt(z.scan_percent, 2)}% · ${scan.function || ""}`
          : scan.state || "No scan"}
      </StatRow>
      {scan.state === "SCANNING" && finite(z.scan_percent) && (
        <Meter
          label="Rebuild progress"
          value={z.scan_percent}
          color={colors.purple}
          className="scan-progress"
        />
      )}
      <StatRow
        label="Drive health"
        tone={drives.length > healthy || errors > 0 ? "warn" : ""}
      >
        {healthy} online · {drives.length - healthy} unavailable · {errors} I/O
        errors
      </StatRow>
      <StatRow label="Data integrity" tone={z.data_errors > 0 ? "bad" : ""}>
        {z.data_errors ?? "—"} known data errors
        {root ? ` · ${bytes(root.used)} data used` : ""}
      </StatRow>
      <h3 className="section-heading">Drives · live activity &amp; health</h3>
      <DataTable label="ZFS drives" columns={driveColumns} data={sorted} />
      <h3 className="section-heading">Datasets</h3>
      <DataTable
        label="ZFS datasets"
        columns={datasetColumns}
        data={z.datasets || []}
      />
      <p className="note">
        Port = SATA port. R/W/CRC = errors. ↻ replacement. ¹ Dataset capacity
        includes shared free space; raw capacity includes parity.
      </p>
    </div>
  );
}

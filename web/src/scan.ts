import type { Zfs } from "./types";
import { bytes, finite, fmt } from "./format";
// Mirrors OpenZFS's issue-rate estimate for the current pass, excluding time
// paused and skipped bytes. Use the sample timestamp, not browser wall time.
export function scanEstimate(z: Zfs) {
  const s = z.scan;
  if (!s || s.state !== "SCANNING") return "";
  if ((s.scrub_pause ?? 0) > 0) return "Paused";
  if (!finite(z.timestamp) || !finite(s.pass_start) || !finite(s.issued_bytes_per_scan))
    return "Estimate unavailable";
  const elapsed = z.timestamp - s.pass_start - (s.scrub_spent_paused ?? 0);
  if (elapsed <= 0 || s.issued_bytes_per_scan <= 0) return "Estimating…";
  const rate = s.issued_bytes_per_scan / elapsed;
  const total = finite(s.to_examine) ? s.to_examine - (s.skipped ?? 0) : null;
  if (
    !finite(total) ||
    !finite(s.issued) ||
    total < s.issued ||
    rate < 10 * 1024 * 1024 ||
    !(s.function === "RESILVER" ? (s.processed ?? 0) > 0 : s.issued > 0)
  )
    return `${bytes(rate)}/s · estimating…`;
  const mins = Math.ceil((total - s.issued) / rate / 60);
  return `${bytes(rate)}/s · ~${mins >= 60 ? `${Math.floor(mins / 60)}h ` : ""}${fmt(mins % 60)}m remaining`;
}

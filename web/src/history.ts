import type { Histories, HistoryPoint } from "./types";
import { finite } from "./format";
const key = "fleet-monitor.history.v1";
const limit = 120;
// Browser-local, bounded numeric telemetry only. Never hydrate host status or
// service health from disk, and never let storage failure stop live polling.
export function pruneHistories(value: unknown, now: number): Histories {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Histories = {};
  for (const [host, points] of Object.entries(value).slice(0, 100)) {
    if (!Array.isArray(points) || ["__proto__", "constructor", "prototype"].includes(host))
      continue;
    const clean = new Map<number, HistoryPoint>();
    for (const point of points.slice(-120)) {
      if (!point || !finite(point.t) || point.t < now - limit || point.t > now + 5) continue;
      const p: HistoryPoint = { t: point.t };
      for (const field of ["cpu", "gpu", "rx", "tx"] as const)
        p[field] = finite(point[field]) && point[field] >= 0 ? point[field] : null;
      clean.set(p.t, p);
    }
    if (clean.size) result[host] = [...clean.values()].sort((a, b) => a.t - b.t);
  }
  return result;
}
export function loadHistories(now = Date.now() / 1000): Histories {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw.length < 2_000_000 ? pruneHistories(JSON.parse(raw), now) : {};
  } catch {
    return {};
  }
}
export function saveHistories(histories: Histories, now = Date.now() / 1000) {
  try {
    localStorage.setItem(key, JSON.stringify(pruneHistories(histories, now)));
  } catch {
    /* Private browsing/full storage: continue in memory. */
  }
}

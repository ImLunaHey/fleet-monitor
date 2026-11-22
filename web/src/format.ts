import type { Host, Metrics } from "./types";
export const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const fmt = (n: unknown, digits = 0) => (finite(n) ? n.toFixed(digits) : "—");
export const gib = (n: number) => n / 1073741824;
export function bytes(n: unknown) {
  if (!finite(n)) return "—";
  let unit = 0;
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  while (n >= 1024 && unit < 4) {
    n /= 1024;
    unit++;
  }
  return `${fmt(n, unit ? 1 : 0)} ${units[unit]}`;
}
export const fresh = (timestamp: unknown, now: number, seconds = 12) =>
  finite(timestamp) && Math.abs(now - timestamp) < seconds;
export const online = (host: Host | undefined, now: number): host is Host & { metrics: Metrics } =>
  !!host?.online && fresh(host.metrics?.timestamp, now);
export const colors = {
  blue: "#89b9ed",
  purple: "#b9a2e8",
  orange: "#e7b57a",
  red: "#ee958c",
  amber: "#e5ae51",
};

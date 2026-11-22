export const finite = (n) => typeof n === "number" && Number.isFinite(n);
export const fmt = (n, digits = 0) => (finite(n) ? n.toFixed(digits) : "—");
export const gib = (n) => n / 1073741824;
export function bytes(n) {
  if (!finite(n)) return "—";
  let unit = 0;
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  while (n >= 1024 && unit < 4) {
    n /= 1024;
    unit++;
  }
  return `${fmt(n, unit ? 1 : 0)} ${units[unit]}`;
}
export const fresh = (timestamp, now, seconds = 12) =>
  finite(timestamp) && Math.abs(now - timestamp) < seconds;
export const online = (host, now) =>
  !!host?.online && fresh(host.metrics?.timestamp, now);
export const colors = {
  blue: "#89b9ed",
  purple: "#b9a2e8",
  orange: "#e7b57a",
  red: "#ee958c",
  amber: "#e5ae51",
};

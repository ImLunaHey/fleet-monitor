import type { Battery } from "../types";
import { finite, fmt } from "../format";
export function BatteryStatus({ battery }: { battery?: Battery | null }) {
  if (!battery || !finite(battery.percent)) return null;
  const tone = battery.percent <= 20 && !battery.plugged_in ? "warn" : "";
  const remaining = finite(battery.minutes_remaining)
    ? ` · ${Math.floor(battery.minutes_remaining / 60)}h ${battery.minutes_remaining % 60}m ${battery.charging ? "to full" : "remaining"}`
    : "";
  return (
    <div className={`battery-status ${tone}`} aria-label="Battery">
      <span className="battery-icon" aria-hidden="true">
        <span style={{ width: `${battery.percent}%` }} />
      </span>
      <span>
        {fmt(battery.percent)}% · {battery.status}
        {remaining}
      </span>
    </div>
  );
}

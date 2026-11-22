import type { ReactNode } from "react";
export function MetricTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
}) {
  return (
    <div className="tile">
      <div className="value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="label">{label}</div>
    </div>
  );
}
export function StatRow({
  label,
  children,
  tone = "",
}: {
  label: string;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className="row">
      <span className={`key ${tone}`}>{label}</span>
      <strong className={tone}>{children}</strong>
    </div>
  );
}
export function Meter({
  value,
  color,
  label,
  className = "bar",
}: {
  value: number;
  color: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      // Custom track preserves identical rendering in the kiosk; all meter ARIA values are provided.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-label={label}
      aria-valuenow={Math.max(0, Math.min(100, value))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
        }}
      />
    </div>
  );
}

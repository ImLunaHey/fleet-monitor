export function MetricTile({ label, value, unit }) {
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
export function StatRow({ label, children, tone = "" }) {
  return (
    <div className="row">
      <span className={`key ${tone}`}>{label}</span>
      <strong className={tone}>{children}</strong>
    </div>
  );
}
export function Meter({ value, color, label, className = "bar" }) {
  return (
    <div
      className={className}
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

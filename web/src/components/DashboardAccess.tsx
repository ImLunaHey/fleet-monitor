import { QRCodeSVG } from "qrcode.react";

export function DashboardAccess({ url }: { url?: string | null }) {
  if (!url) return null;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
    return null;
  return (
    <aside
      className="dashboard-access"
      aria-label="Open dashboard on another device"
      title="Connect to the same network"
    >
      <a href={target.href} aria-label="Open this dashboard on your phone or tablet">
        <QRCodeSVG
          value={target.href}
          size={64}
          marginSize={4}
          level="M"
          title="Scan to open this dashboard"
        />
      </a>
      <div>
        <strong>Scan to open</strong>
        <a href={target.href}>{target.host}</a>
      </div>
    </aside>
  );
}

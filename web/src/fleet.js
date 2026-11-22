import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
export async function fetchJSON(path, signal) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(3500)]);
  const response = await fetch(path, { cache: "no-store", signal: combined });
  if (!response.ok)
    throw Error(`Telemetry request failed (${response.status})`);
  return response.json();
}
export function appendHistory(histories, fleet) {
  const next = { ...histories };
  for (const [name, host] of Object.entries(fleet || {})) {
    if (!host.online || !host.metrics) continue;
    const d = host.metrics,
      h = next[name] || [];
    if (h.at(-1)?.t === d.timestamp) continue;
    next[name] = [
      ...h.filter((p) => d.timestamp - p.t <= 120),
      {
        t: d.timestamp,
        cpu: d.cpu?.usage,
        gpu: d.gpu?.usage ?? null,
        rx: d.network?.download,
        tx: d.network?.upload,
      },
    ];
  }
  return next;
}
export function useFleet() {
  const fleet = useQuery({
    queryKey: ["fleet"],
    queryFn: ({ signal }) => fetchJSON("/api/fleet", signal),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const config = useQuery({
    queryKey: ["config"],
    queryFn: ({ signal }) => fetchJSON("/api/config", signal),
    staleTime: Infinity,
    retry: false,
  });
  const [histories, setHistories] = useState({});
  useEffect(() => {
    if (fleet.data) setHistories((old) => appendHistory(old, fleet.data));
  }, [fleet.data]);
  return {
    fleet: fleet.data || {},
    config: config.data || {},
    histories,
    error: fleet.isError,
  };
}

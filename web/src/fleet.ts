import type { Fleet, FleetConfig, Histories } from "./types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
export async function fetchJSON<T>(path: string, signal: AbortSignal): Promise<T> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(3500)]);
  const response = await fetch(path, { cache: "no-store", signal: combined });
  if (!response.ok) throw Error(`Telemetry request failed (${response.status})`);
  return response.json();
}
export function appendHistory(histories: Histories, fleet: Fleet) {
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
  const client = useQueryClient();
  const fleet = useQuery({
    queryKey: ["fleet"],
    queryFn: async ({ signal }) => {
      const hosts = await fetchJSON<Fleet>("/api/fleet", signal);
      const previous = client.getQueryData<{ hosts: Fleet; histories: Histories }>(["fleet"]);
      return { hosts, histories: appendHistory(previous?.histories ?? {}, hosts) };
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const config = useQuery({
    queryKey: ["config"],
    queryFn: ({ signal }) => fetchJSON<FleetConfig>("/api/config", signal),
    staleTime: Infinity,
    retry: false,
  });
  return {
    fleet: fleet.data?.hosts || {},
    config: config.data || {},
    histories: fleet.data?.histories || {},
    error: fleet.isError,
  };
}

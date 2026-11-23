import { loadHistories, saveHistories, pruneHistories } from "./history";
import { fresh } from "./format";
import type { Fleet, FleetConfig, Histories, UnifiSnapshot } from "./types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
export async function fetchJSON<T>(path: string, signal: AbortSignal): Promise<T> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(3500)]);
  const response = await fetch(path, { cache: "no-store", signal: combined });
  if (!response.ok) throw Error(`Telemetry request failed (${response.status})`);
  return response.json();
}
export function appendHistory(histories: Histories, fleet: Fleet) {
  const next = Object.fromEntries(
    Object.entries(histories).filter(([key]) => !key.startsWith("wan:")),
  );
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
export function retainMetrics(previous: Fleet, incoming: Fleet): Fleet {
  return Object.fromEntries(
    Object.entries(incoming).map(([name, host]) => [
      name,
      {
        ...host,
        online: host.online && !!host.metrics,
        metrics: host.metrics ?? previous[name]?.metrics,
      },
    ]),
  );
}
export function useFleet() {
  const client = useQueryClient();
  const fleet = useQuery({
    queryKey: ["fleet"],
    queryFn: async ({ signal }) => {
      const hosts = await fetchJSON<Fleet>("/api/fleet", signal);
      const previous = client.getQueryData<{ hosts: Fleet; histories: Histories }>(["fleet"]);
      const histories = appendHistory(previous?.histories ?? loadHistories(), hosts);
      saveHistories({ ...loadHistories(), ...histories });
      return { hosts: retainMetrics(previous?.hosts ?? {}, hosts), histories };
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
  const network = useQuery({
    queryKey: ["network"],
    queryFn: async ({ signal }) => {
      const data = await fetchJSON<UnifiSnapshot>("/api/network", signal);
      const previous = client.getQueryData<UnifiSnapshot & { histories: Histories }>(["network"]);
      const histories = appendNetworkHistory(previous?.histories ?? loadHistories(), data);
      saveHistories({ ...loadHistories(), ...histories });
      return { ...data, histories };
    },
    enabled: config.data?.networkEnabled === true,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    network: network.data,
    networkHistories: network.data?.histories || {},
    networkError: network.isError,
    fleet: fleet.data?.hosts || {},
    config: config.data || {},
    histories: fleet.data?.histories || {},
    error: fleet.isError,
  };
}

export function appendNetworkHistory(previous: Histories, data: UnifiSnapshot): Histories {
  const next = Object.fromEntries(
    Object.entries(pruneHistories(previous, Date.now() / 1000)).filter(([key]) =>
      key.startsWith("wan:"),
    ),
  );
  if (!data.available) return next;
  for (const d of data.devices ?? []) {
    if (d.kind !== "gateway" || !fresh(d.extraTimestamp, Date.now() / 1000, 90)) continue;
    const key = "wan:" + d.id,
      h = next[key] ?? [];
    if (h.at(-1)?.t === d.extraTimestamp) continue;
    const wan = d.wan?.filter((w) => w.up) ?? [];
    const sum = (key: "rx_bytes-r" | "tx_bytes-r") =>
      wan.length && wan.every((w) => typeof w[key] === "number")
        ? wan.reduce((n, w) => n + (w[key] ?? 0), 0)
        : null;
    next[key] = [...h, { t: d.extraTimestamp!, rx: sum("rx_bytes-r"), tx: sum("tx_bytes-r") }];
  }
  return next;
}

import type { Metrics } from "./types";
export const now = 1000;
export const metrics = (): Metrics => ({
  timestamp: now,
  cpu_name: "Example CPU",
  cpu: { usage: 25, temperature: 55 },
  memory: { used: 8 * 2 ** 30, total: 16 * 2 ** 30 },
  disk: {
    used: 100 * 2 ** 30,
    total: 500 * 2 ** 30,
    free: 400 * 2 ** 30,
    percent: 20,
    read: 1024,
    write: 2048,
    iops: 10,
  },
  network: { download: 2048, upload: 1024, address: "192.0.2.1" },
  uptime: 3600,
  gpu: {
    name: "Example GPU",
    usage: 0,
    kind: "discrete",
    memory_used: 4096,
    memory_total: 8192,
  },
  services: {},
});

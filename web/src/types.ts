export type Reading = number | null;
export interface Gpu {
  name: string;
  kind?: string;
  status?: string;
  reason?: string;
  usage?: Reading;
  temperature?: Reading;
  power?: Reading;
  core_clock?: Reading;
  memory_used?: Reading;
  memory_total?: Reading;
  memory_label?: string;
  memory_note?: string;
}
export interface Battery {
  percent?: Reading;
  status: string;
  plugged_in?: boolean;
  charging?: boolean;
  minutes_remaining?: Reading;
}
export interface Network {
  download?: Reading;
  upload?: Reading;
  address?: string;
}
export interface Drive {
  port?: number | null;
  name: string;
  path?: string;
  device?: string;
  state: string;
  replacing?: boolean;
  missing?: number | boolean | null;
  size?: Reading;
  temperature?: Reading;
  read?: Reading;
  write?: Reading;
  iops?: Reading;
  busy?: Reading;
  read_errors?: Reading;
  write_errors?: Reading;
  checksum_errors?: Reading;
}
export interface Dataset {
  name: string;
  used: number;
  available: number;
}
export interface Zfs {
  available: boolean;
  timestamp?: number;
  name?: string;
  state?: string;
  raw_used?: Reading;
  raw_total?: Reading;
  data_errors?: Reading;
  read_errors?: Reading;
  write_errors?: Reading;
  checksum_errors?: Reading;
  scan?: {
    state?: string;
    function?: string;
    to_examine?: Reading;
    issued?: Reading;
    skipped?: Reading;
    processed?: Reading;
    issued_bytes_per_scan?: Reading;
    pass_start?: Reading;
    scrub_pause?: Reading;
    scrub_spent_paused?: Reading;
  };
  scan_percent?: Reading;
  drives?: Drive[];
  datasets?: Dataset[];
}
export interface Metrics {
  hardware_model?: string;
  llm?: {
    available: boolean;
    timestamp: number;
    model: string;
    active: Reading;
    queued: Reading;
    tokensPerSecond: Reading;
  } | null;
  timestamp: number;
  cpu_name: string;
  uptime: number;
  cpu: { usage?: Reading; temperature?: Reading };
  memory: { used: number; total: number };
  disk: {
    used: number;
    total: number;
    free: number;
    percent: number;
    read?: Reading;
    write?: Reading;
    iops?: Reading;
  };
  network: Network;
  gpu?: Gpu | null;
  battery?: Battery | null;
  zfs?: Zfs;
  services?: Record<string, boolean>;
}
export interface Host {
  online: boolean;
  metrics?: Metrics;
}
export type Fleet = Record<string, Host>;
export interface FleetConfig {
  alertHosts?: string[];
  hideOfflineFooter?: boolean;
  networkEnabled?: boolean;
  title?: string;
  order?: string[];
  featuredHost?: string;
  compactHosts?: string[];
}
export interface HistoryPoint {
  t: number;
  cpu?: Reading;
  gpu?: Reading;
  rx?: Reading;
  tx?: Reading;
}
export type Histories = Record<string, HistoryPoint[]>;
export interface UnifiPort {
  powerWatts?: Reading;
  idx: number;
  state: string;
  connector: string;
  speedMbps?: number | null;
  poe?: { state: string };
}
export interface UnifiRadio {
  frequencyGHz: number;
  channel: number | null;
  channelWidthMHz: number | null;
  txRetriesPct: number | null;
}
export interface UnifiDevice {
  powerWatts?: Reading;
  powerBudgetWatts?: Reading;
  extraTimestamp?: number;
  wan?: { up: boolean; "rx_bytes-r": Reading; "tx_bytes-r": Reading }[] | null;
  id: string;
  name: string;
  kind: "gateway" | "switch" | "ap";
  state: string;
  timestamp: number;
  cpu: Reading;
  memory: Reading;
  uptime: Reading;
  ports: UnifiPort[] | null;
  radios: UnifiRadio[] | null;
  clients: number;
}
export interface UnifiSnapshot {
  available: boolean;
  timestamp: number;
  devices: UnifiDevice[] | null;
  wired: number;
  wireless: number;
  clients: number;
}

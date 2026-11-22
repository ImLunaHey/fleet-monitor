# Fleet Monitor

A passive, dark hardware dashboard for a fleet of NixOS and macOS machines.
Run a small **Go agent** on each host and a **React dashboard** on one of them.
The dashboard uses **Tailwind CSS**, **TanStack Query** for polling and
**TanStack Table** for storage tables. The whole UI builds into one HTML file;
no CDN, Node process, or cloud service is needed at runtime.

## NixOS

Add the flake and import its module:

```nix
{
  inputs.fleet-monitor.url = "github:ImLunaHey/fleet-monitor";
  # Optional: share your existing nixpkgs pin.
  inputs.fleet-monitor.inputs.nixpkgs.follows = "nixpkgs";

  outputs = { nixpkgs, fleet-monitor, ... }: {
    nixosConfigurations.example = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        fleet-monitor.nixosModules.default
        ./configuration.nix
      ];
    };
  };
}
```

On a monitored machine:

```nix
services.fleet-monitor = {
  enable = true;
  mode = "agent";
  listenAddress = "192.0.2.10"; # replace with this host's LAN/VPN address
  allowedClients = [ "127.0.0.1" "192.0.2.20" ]; # dashboard host
  interface = "enp1s0"; # optional; otherwise follows the default IPv4 route
  openFirewall = true;
  # intelGPU = true; # i915 counters + a separate read-only memory probe
  # amdGpuName = "Radeon integrated GPU";
  # zfsPool = "tank";
};
```

On the dashboard host:

```nix
services.fleet-monitor = {
  enable = true;
  mode = "dashboard";
  title = "Homelab";
  peers.nas = "http://192.0.2.10:8099/api/metrics";
  featuredHost = "nas";
  hostOrder = [ "workstation" "mini" "laptop" "nas" ];
  compactHosts = [ "gateway" ];
  healthChecks = { "Local inference" = "http://127.0.0.1:8080/health"; };
  kiosk.enable = true; # optional: Cage + Chromium on tty1, no input needed
};
```

By default HTTP binds to `127.0.0.1:8099` and permits only loopback clients.
Dashboard mode includes the local machine automatically. The featured host
fills the right column; other live hosts use the grid on the left. Offline
hosts collapse into a footer. The intended wall-display layout fits four main
hosts plus one featured host at 3440×1440; more hosts are best placed in
`compactHosts`. The lower-height style also fits 1080p displays, with smaller
text. No page switching is required.

`kiosk.softwareRendering` defaults to true to preserve GPU memory.
`kiosk.environment.WLR_DRM_DEVICES` can select a specific display GPU.
The kiosk disables the tty1 getty aliases, keeps the monitor awake, and starts
again after crashes and dashboard updates. Ctrl+Alt+F2 opens a login console.

## macOS / nix-darwin

Import `fleet-monitor.darwinModules.default` and set the same
`services.fleet-monitor` options (except `openFirewall` and `kiosk`).
The user LaunchAgent runs at login as `system.primaryUser`. No sudo is needed
for Apple GPU, CPU/GPU temperature, battery or disk activity collection.
Create `~/Library/Logs` if it does not already exist. Configure private-network
access in your firewall as appropriate. Dashboard mode can also serve a page
on a Mac; automatic fullscreen kiosk setup is NixOS-only.

## Readings and limitations

- CPU load/temperature, memory used/total, disk space/read/write/IOPS, uptime,
  and receive/transmit graphs. Graph axes show the last two minutes and their
  actual percentage/throughput scale; no history is persisted across refreshes.
- NVIDIA: utilization, dedicated VRAM, temperature, clocks and power through
  `nvidia-smi`. Set `environment.NVIDIA_SMI` to its absolute path on NixOS.
- AMD: sysfs load, reserved UMA, temperature and clocks when `amdGpuName` is
  configured. This reader currently targets integrated Radeon graphics.
- Intel i915: busiest-engine utilization, clocks, and GPU client RAM. Enabling
  `intelGPU` gives the HTTP collector CAP_PERFMON and starts a separate root
  oneshot probe every five seconds to read DRM debugfs and process fdinfo.
  The collector consumes its timestamped JSON without gaining proc/debugfs
  privileges. Repeated file descriptors are deduplicated by DRM client ID;
  kernel buffers are excluded, and buffers shared across clients may be counted
  per client. There is no invented fixed VRAM capacity. Unreadable, incomplete,
  or stale samples remain unavailable; no active clients reports zero.
  Intel Xe counters are not supported yet.
- Apple silicon: AGX utilization/shared RAM and SMC average CPU/GPU sensor
  temperatures. Apple GPUs use system memory rather than dedicated VRAM.
  SMC sensor families follow the approach documented by
  [macmon](https://github.com/vladkens/macmon); private macOS sensor interfaces
  can change between OS versions. Tested on M2 Pro and M4.
- MacBook battery charge, charging/plugged-in state and valid time estimates.
  Desktop Macs do not display a battery row. Optimized charging is not confused
  with active charging.
- APFS disk activity resolves the Data volume to its physical backing stores;
  this is whole-drive activity, not per-volume accounting.
- ZFS pool/scan health, datasets, SATA port numbers, drive read/write rates,
  IOPS, busy time and read/write/checksum errors. Requires `zpool status -j`
  support. Missing members remain visible during replacement. Dataset totals
  include shared free space; raw pool space includes parity.
- Optional drive temperatures come from `sensorFile`, a fresh text file with
  `temp_sda: 32` lines written by a trusted SMART reader. The agent does not
  receive unrestricted disk access. Non-SATA devices may lack port numbers.

One GPU is selected per host. Unsupported and stale readings are shown as
unavailable, never invented as zero. Polling is independent per peer, with
bounded timeouts; losing a remote host does not stop the local dashboard.

## Access model

This is a read-only private-network tool, not an Internet-facing authenticated
monitoring service. There is no separate API key or TLS termination.
`allowedClients` checks exact remote IP addresses and ignores forwarded headers.
Keep agents on a trusted LAN/VPN. `openFirewall` opens the TCP port; the HTTP
source allowlist still applies, and you can use narrower firewall rules instead.
Peer and health-check URLs are administrator-configured; browsers cannot submit
arbitrary probe URLs. Do not put secrets in Nix options (they enter the store).

Endpoints: `/api/metrics` on every agent; `/` and `/api/fleet` on dashboard
instances; `/api/config` supplies layout settings. `/api/peers/NAME` can relay
only configured peers. Reads use GET; other methods are rejected.

## Development

```sh
nix develop
(cd collector && go test ./... && go vet ./...)
(cd web && npm ci && npm run check)
nix build .#collector .#dashboard
```

The strict TypeScript/TSX React components are in `web/src/components`.
`npm run check` runs TypeScript, Oxlint with React Doctor rules, Oxfmt, Vitest
coverage, and the production build. Use `npm run format` to apply formatting.
Tests cover missing/stale
hosts, replacement drives, axes/history gaps, GPU memory, battery states and
capacity display. Collector tests cover ZFS parsing, counter resets, APFS
mapping, sensor validation, battery parsing, and Intel memory accounting.
Nix dashboard builds also run the type, lint, formatting, and coverage checks.
Coverage gates apply per source file (90% lines/statements/functions, 85%
branches); only bootstrap, types, fixtures, and test setup are excluded.
Package and npm dependencies are locked; after dependency
changes update `npmDepsHash` in `nix/dashboard.nix` using Nix's reported hash.

For a non-Nix build, build the Go executable in `collector`, run `npm run build`
in `web`, and set `DASHBOARD_HTML` to `web/dist/index.html`. Module environment
mappings are documented directly in `nix/environment.nix`; `METRICS_PORT`
defaults to 8099 and `METRICS_BIND` to loopback.

MIT licensed.

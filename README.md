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

## UniFi Network

The dashboard can show a shallow gateway, switch-port, and access-point strip
above the existing host cards. Enable it on the dashboard host:

```nix
services.fleet-monitor = {
  mode = "dashboard";
  hideOfflineFooter = true;
  unifi = {
    enable = true;
    url = "https://controller.example/proxy/network/integration/v1";
    siteId = "your-site-uuid";
    legacySite = "default"; # Optional WAN/PoE supplement on local UniFi OS
    apiKeyFile = "/var/lib/fleet-monitor-secrets/unifi-api-key";
    # Optional SHA256 leaf-certificate pin for a self-signed controller:
    # certificateSha256 = "64 hexadecimal characters";
  };
};
```

Provision the key separately as a root-readable runtime file; never embed it
in a Nix expression or commit it. On NixOS, systemd `LoadCredential` makes it
available to the collector without giving its HTTP process root access. On
macOS, the configured agent user must be able to read the file. Normal TLS
verification is the default; an explicit certificate pin is verified before
any API credential is sent. Redirects are never followed.

The Go backend polls the official Integration API with GET requests every ten
seconds, with bounded timeouts and paginated inventory reads. `/api/network`
exposes normalized readings, not the controller key, client identities, MACs,
or IP addresses. Only device names/IDs and aggregate client counts are retained.
The strip shows device status, CPU/RAM, uptime, negotiated port speeds, active
PoE state, and radio channels/widths/retries. When `legacySite` is set, a
read-only request to the same controller’s `/proxy/network/api/s/<site>/stat/device`
compatibility endpoint adds explicit WAN receive/transmit byte rates, per-port
PoE watts, and the effective PoE budget. This endpoint is version-dependent;
missing or stale supplementary readings stay unknown without hiding the base
Integration API data. No WAN speed is inferred from generic uplink counters.
Controller failures and stale device heartbeats suppress healthy indicators.

The compact layout targets an ultrawide monitor with a small device inventory
(the gateway, switch and AP arrangement); large sites need a tailored layout.

## History, alerts and inference

The browser saves a bounded two-minute window of numeric CPU/GPU/network/WAN
history locally. It survives page/kiosk restarts; it is not a long-term database.
Expired samples are dropped and gaps are not joined. Storage failure leaves
live polling operational. Saved samples never restore host health or status.

Alerts share the title/clock row and clear when current readings recover.
They cover disk usage at 95%, CPU at 90°C, GPU at 85°C, failed services,
stale telemetry, degraded ZFS, data errors and HDD temperatures at 45°C
(critical at 55°C). When more than three alerts exist, groups rotate every
eight seconds. Set `alertHosts = [ "desktop" "nas" ];` for hosts expected to
remain online; intentionally offline hosts need not be included.

Set `llamaUrl = "http://127.0.0.1:8080";` and start llama.cpp with `--metrics`
to show the loaded model, active/queued requests and generation throughput.
The collector reads only aggregate metrics and model identity, never prompts
or outputs. “Active” includes prompt processing; idle throughput is labelled
as the last reported value. macOS agents automatically report the Mac model
name alongside the chip. ZFS estimates follow OpenZFS's current-pass issued
byte rate, excluding skipped bytes and paused time; unavailable estimates
are explicit.

## Releases and Nix packages

The default Nix packages download the single compiled HTML file and the
matching collector executable from a versioned GitHub release. Each asset is
pinned by SHA-256 in `nix/release.json`; Nix only installs the fetched files,
with no Go, Node or npm compilation. Linux and macOS support x86_64 and aarch64.
Existing service and kiosk runtime dependencies remain managed by Nix.

Source builds remain available as `collector-source` and `dashboard-source`.
Flake checks use those source builds. To test a local code change through a
module, override `package` and `dashboardPackage` with those packages; default
packages intentionally use the pinned released version.

Releases are managed by [release-please](https://github.com/googleapis/release-please-action).
Conventional Commits on main update a release PR with a version and changelog.
CI builds the single HTML file and all four collector binaries, then commits their
SHA-256 hashes to that PR. Checks are explicitly dispatched for the bot branch,
so no personal access token is needed. Repository Actions settings must allow
GitHub Actions to create pull requests.

Review the release PR and its checks before merging. Merging creates a tagged
draft release and invokes publication directly in the same workflow (the built-in
GitHub token does not trigger separate tag workflows). Publication runs Go tests
on Linux/macOS and all frontend quality/coverage checks, rebuilds the artifacts,
and verifies every hash against the merged Nix manifest. Only then does it upload
the seven assets and publish the release. Existing assets are never overwritten.
Consumers update their flake lock to adopt the release.

To retry an interrupted publication, dispatch the Release workflow with its
existing tag. Already uploaded assets are compared byte-for-byte before proceeding.
To reproduce a build locally, use Go 1.25.5 and Node 22.21.1, run
`(cd web && npm ci)`, then `scripts/build-release.sh vX.Y.Z`.

## Development

### Checks

```sh
nix develop
(cd collector && go test ./... && go vet ./...)
(cd web && npm ci && npm run check)
nix build .#collector-source .#dashboard-source
```

The strict TypeScript/TSX React components are in `web/src/components`.
`npm run check` runs TypeScript, Oxlint with React Doctor rules, Oxfmt, Vitest
coverage, and the production build. Use `npm run format` to apply formatting.
Tests cover missing/stale
hosts, replacement drives, axes/history gaps, GPU memory, battery states and
capacity display. Collector tests cover ZFS parsing, counter resets, APFS
mapping, sensor validation, battery parsing, and Intel memory accounting.
Nix dashboard source builds also run the type, lint, formatting, and coverage checks.
Coverage gates apply per source file (90% lines/statements/functions, 85%
branches); only bootstrap, types, fixtures, and test setup are excluded.
Package and npm dependencies are locked; after dependency
changes update `npmDepsHash` in `nix/dashboard-source.nix` using Nix's reported hash.

For a non-Nix build, build the Go executable in `collector`, run `npm run build`
in `web`, and set `DASHBOARD_HTML` to `web/dist/index.html`. Module environment
mappings are documented directly in `nix/environment.nix`; `METRICS_PORT`
defaults to 8099 and `METRICS_BIND` to loopback.

MIT licensed.

### Physical drive slots

Configure the enclosure wiring on the dashboard host, independently for each peer.
Keys are ATA controller port numbers (the values in the ATA column), and values
specify the corresponding physical slot. For example, ATA 6 connects to slot 2:

```nix
services.fleet-monitor.driveSlots.nas = {
  "6" = { slot = 2; };
  "2" = { slot = 6; };
};
```

This mapping survives drive replacements and changes to serials or /dev/sdX names.
The table sorts by physical slot, keeps a separate ATA column, and marks missing
or unmapped ports `—`. Without a mapping,
only ATA ports are shown. Old and replacement drives on the same ATA port display
the same physical slot automatically. Update the mapping if the enclosure wiring
changes. Hosts without Nix can set the same `driveSlots` object in
`DASHBOARD_CONFIG` JSON. Slot metadata is display-only and never changes ZFS.

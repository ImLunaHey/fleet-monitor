{ config, lib, pkgs, ... }:
let inherit (lib) mkEnableOption mkOption types; in {
  options.services.fleet-monitor = {
    enable = mkEnableOption "Fleet Monitor";
    mode = mkOption { type = types.enum [ "agent" "dashboard" ]; default = "agent"; description = "Serve host metrics only, or host metrics and the fleet dashboard."; };
    package = mkOption { type = types.package; default = pkgs.callPackage ./collector.nix { }; description = "Collector executable package."; };
    dashboardPackage = mkOption { type = types.package; default = pkgs.callPackage ./dashboard.nix { }; description = "Compiled dashboard with index.html."; };
    name = mkOption { type = types.str; default = config.networking.hostName; description = "Name shown for this machine."; };
    interface = mkOption { type = types.nullOr types.str; default = null; description = "Network interface to measure; null selects the default IPv4 route."; };
    listenAddress = mkOption { type = types.str; default = "127.0.0.1"; description = "Bind address. Use a trusted LAN/VPN address for remote agents."; };
    port = mkOption { type = types.port; default = 8099; description = "HTTP port."; };
    allowedClients = mkOption { type = types.listOf types.str; default = [ "127.0.0.1" "::1" ]; description = "Exact source IP addresses permitted to read metrics; no CIDR ranges."; };
    peers = mkOption { type = types.attrsOf types.str; default = { }; description = "Fixed peer names mapped to their /api/metrics URLs."; };
    healthChecks = mkOption { type = types.attrsOf types.str; default = { }; description = "Named HTTP health URLs; HTTP 200 is healthy."; };
    title = mkOption { type = types.str; default = "Fleet Monitor"; description = "Heading above the host cards."; };
    featuredHost = mkOption { type = types.nullOr types.str; default = null; description = "Host shown in the full-height right column (usually the ZFS host)."; };
    hostOrder = mkOption { type = types.listOf types.str; default = [ ]; description = "Preferred host order; other configured hosts follow."; };
    compactHosts = mkOption { type = types.listOf types.str; default = [ ]; description = "Hosts shown in a compact footer instead of a card."; };
    hideOfflineFooter = mkOption { type = types.bool; default = false; description = "Hide the footer and offline host list to reserve space for network telemetry."; };
    unifi = {
      enable = mkEnableOption "read-only UniFi Network telemetry";
      url = mkOption { type = types.str; default = ""; description = "HTTPS Integration API base URL, including /proxy/network/integration/v1 on UniFi OS."; };
      siteId = mkOption { type = types.str; default = ""; description = "UniFi site UUID."; };
      apiKeyFile = mkOption { type = types.str; default = ""; description = "Runtime path to the API key; never put its contents in the Nix store. NixOS loads it as a systemd credential."; };
      certificateSha256 = mkOption { type = types.str; default = ""; description = "Optional SHA256 certificate pin for a local self-signed controller. Empty uses normal TLS verification."; };
    };
    intelGPU = mkEnableOption "Intel i915 performance counters (CAP_PERFMON on Linux)";
    amdGpuName = mkOption { type = types.nullOr types.str; default = null; description = "Enable AMD sysfs telemetry and override its display name."; };
    zfsPool = mkOption { type = types.nullOr types.str; default = null; description = "Optional ZFS pool to monitor."; };
    sensorFile = mkOption { type = types.nullOr types.path; default = null; description = "Optional text file with temp_DEVICE: CELSIUS readings from a trusted SMART collector."; };
    environment = mkOption { type = types.attrsOf types.str; default = { }; description = "Additional collector environment variables."; };
  };
}

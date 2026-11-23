{ cfg, lib, pkgs }:
{
  METRICS_NAME = cfg.name;
  METRICS_BIND = cfg.listenAddress;
  METRICS_PORT = toString cfg.port;
  METRICS_ALLOWED_CLIENTS = lib.concatStringsSep "," cfg.allowedClients;
  DASHBOARD_PEERS = builtins.toJSON cfg.peers;
  METRICS_HEALTH_CHECKS = builtins.toJSON cfg.healthChecks;
} // lib.optionalAttrs (cfg.interface != null) { METRICS_INTERFACE = cfg.interface; }
  // lib.optionalAttrs (cfg.mode == "dashboard") {
    DASHBOARD_HTML = "${cfg.dashboardPackage}/index.html";
    DASHBOARD_CONFIG = builtins.toJSON { inherit (cfg) title featuredHost compactHosts hideOfflineFooter alertHosts; networkEnabled = cfg.unifi.enable; order = cfg.hostOrder; };
  }
  // lib.optionalAttrs (cfg.amdGpuName != null) { AMD_GPU_NAME = cfg.amdGpuName; }
  // lib.optionalAttrs (cfg.sensorFile != null) { METRICS_SENSOR_FILE = toString cfg.sensorFile; }
  // lib.optionalAttrs (cfg.llamaUrl != null) { LLAMA_URL = cfg.llamaUrl; }
  // lib.optionalAttrs (cfg.zfsPool != null) { METRICS_ZFS_POOL = cfg.zfsPool; ZPOOL = "${pkgs.zfs}/bin/zpool"; ZFS = "${pkgs.zfs}/bin/zfs"; }
  // lib.optionalAttrs cfg.unifi.enable { UNIFI_URL = cfg.unifi.url; UNIFI_SITE_ID = cfg.unifi.siteId; UNIFI_LEGACY_SITE = cfg.unifi.legacySite; UNIFI_API_KEY_FILE = cfg.unifi.apiKeyFile; UNIFI_CERTIFICATE_SHA256 = cfg.unifi.certificateSha256; }
  // cfg.environment

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
    DASHBOARD_CONFIG = builtins.toJSON { inherit (cfg) title featuredHost compactHosts; order = cfg.hostOrder; };
  }
  // lib.optionalAttrs (cfg.amdGpuName != null) { AMD_GPU_NAME = cfg.amdGpuName; }
  // lib.optionalAttrs (cfg.sensorFile != null) { METRICS_SENSOR_FILE = toString cfg.sensorFile; }
  // lib.optionalAttrs (cfg.zfsPool != null) { METRICS_ZFS_POOL = cfg.zfsPool; ZPOOL = "${pkgs.zfs}/bin/zpool"; ZFS = "${pkgs.zfs}/bin/zfs"; }
  // cfg.environment

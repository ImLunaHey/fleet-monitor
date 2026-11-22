{ config, lib, pkgs, ... }:
let
  cfg = config.services.fleet-monitor;
  kioskURL = "http://${if cfg.listenAddress == "0.0.0.0" then "127.0.0.1" else cfg.listenAddress}:${toString cfg.port}/";
  kiosk = pkgs.writeShellScript "fleet-monitor-kiosk" ''
    until ${pkgs.curl}/bin/curl --silent --fail ${lib.escapeShellArg kioskURL} >/dev/null; do sleep 1; done
    exec ${pkgs.dbus}/bin/dbus-run-session -- ${pkgs.chromium}/bin/chromium \
      --kiosk --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
      --disable-infobars --disable-background-networking --disable-component-update \
      ${lib.optionalString cfg.kiosk.softwareRendering "--disable-gpu"} --ozone-platform=wayland \
      --password-store=basic --user-data-dir=/var/lib/fleet-monitor-kiosk/chromium ${lib.escapeShellArg kioskURL}
  '';
in {
  imports = [ ./options.nix ];
  options.services.fleet-monitor = {
    openFirewall = lib.mkEnableOption "the collector HTTP port in the firewall (source allowlist still applies)";
    kiosk = {
      enable = lib.mkEnableOption "a passive fullscreen dashboard on tty1";
      softwareRendering = lib.mkOption { type = lib.types.bool; default = true; description = "Use CPU rendering to preserve GPU memory."; };
      environment = lib.mkOption { type = lib.types.attrsOf lib.types.str; default = { }; description = "Extra Cage variables, for example WLR_DRM_DEVICES."; };
    };
  };
  config = lib.mkIf cfg.enable (lib.mkMerge [ {
    assertions = [
      { assertion = cfg.allowedClients != [ ]; message = "fleet-monitor.allowedClients must list permitted source addresses."; }
      { assertion = !cfg.kiosk.enable || cfg.mode == "dashboard"; message = "fleet-monitor kiosk requires dashboard mode."; }
    ];
    networking.firewall.allowedTCPPorts = lib.optionals cfg.openFirewall [ cfg.port ];
    systemd.services.fleet-monitor = {
      description = "Fleet Monitor hardware telemetry";
      wantedBy = [ "multi-user.target" ]; after = [ "network-online.target" ]; wants = [ "network-online.target" ];
      environment = (import ./environment.nix { inherit cfg lib pkgs; }) // lib.optionalAttrs cfg.intelGPU {
        METRICS_INTEL_MEMORY_FILE = "/run/fleet-monitor-intel/memory.json";
      };
      serviceConfig = {
        ExecStart = lib.getExe cfg.package; DynamicUser = true; Restart = "always"; RestartSec = "5s";
        NoNewPrivileges = true; ProtectSystem = "strict"; ProtectHome = true; PrivateTmp = true;
        AmbientCapabilities = lib.optionals cfg.intelGPU [ "CAP_PERFMON" ];
        CapabilityBoundingSet = lib.optionals cfg.intelGPU [ "CAP_PERFMON" ];
      };
      unitConfig.StartLimitIntervalSec = 0;
    };
  } (lib.mkIf cfg.intelGPU {
    # Keep proc/debugfs access in a short-lived probe, out of the HTTP service.
    systemd.services.fleet-monitor-intel-memory = {
      description = "Read Intel DRM client memory counters";
      serviceConfig = {
        Type = "oneshot"; User = "root"; RuntimeDirectory = "fleet-monitor-intel";
        RuntimeDirectoryPreserve = true; RuntimeDirectoryMode = "0755";
        ProtectSystem = "strict"; ProtectHome = true; PrivateTmp = true;
        NoNewPrivileges = true; RestrictAddressFamilies = [ "AF_UNIX" ];
        TimeoutStartSec = "8s";
      };
      script = ''
        umask 022
        ${lib.getExe cfg.package} --intel-memory-probe > /run/fleet-monitor-intel/memory.json.tmp
        mv /run/fleet-monitor-intel/memory.json.tmp /run/fleet-monitor-intel/memory.json
      '';
    };
    systemd.timers.fleet-monitor-intel-memory = {
      wantedBy = [ "timers.target" ];
      timerConfig = { OnBootSec = "5s"; OnUnitInactiveSec = "5s"; AccuracySec = "1s"; };
    };
  }) (lib.mkIf cfg.kiosk.enable {
    boot.kernelParams = [ "consoleblank=0" ];
    fonts.packages = [ pkgs.inter ];
    users.groups.fleet-monitor-kiosk = { };
    users.users.fleet-monitor-kiosk = { isSystemUser = true; group = "fleet-monitor-kiosk"; extraGroups = [ "video" "render" ]; home = "/var/lib/fleet-monitor-kiosk"; createHome = true; linger = true; };
    systemd.services."getty@tty1".enable = false;
    systemd.services."autovt@tty1".enable = false;
    services.cage = {
      enable = true; user = "fleet-monitor-kiosk"; program = kiosk; restartIfChanged = true; extraArguments = [ "-s" "-d" ];
      environment = { WLR_LIBINPUT_NO_DEVICES = "1"; } // lib.optionalAttrs cfg.kiosk.softwareRendering { WLR_RENDERER = "pixman"; } // cfg.kiosk.environment;
    };
    systemd.services.cage-tty1 = { after = [ "fleet-monitor.service" ]; wants = [ "fleet-monitor.service" ]; restartTriggers = [ cfg.dashboardPackage ]; serviceConfig = { Restart = "always"; RestartSec = "3s"; }; };
  }) ]);
}

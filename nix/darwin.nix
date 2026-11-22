{ config, lib, pkgs, ... }:
let cfg = config.services.fleet-monitor; in {
  imports = [ ./options.nix ];
  config = lib.mkIf cfg.enable {
    assertions = [ { assertion = cfg.allowedClients != [ ]; message = "fleet-monitor.allowedClients must list permitted source addresses."; } ];
    launchd.user.agents.fleet-monitor.serviceConfig = {
      Label = "org.fleet-monitor.agent";
      ProgramArguments = [ (lib.getExe cfg.package) ];
      EnvironmentVariables = import ./environment.nix { inherit cfg lib pkgs; };
      RunAtLoad = true; KeepAlive = true; ThrottleInterval = 5;
      StandardErrorPath = "/Users/${config.system.primaryUser}/Library/Logs/fleet-monitor.log";
    };
  };
}

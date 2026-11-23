{ lib, stdenvNoCC, fetchurl }:
let
  release = builtins.fromJSON (builtins.readFile ./release.json);
  asset = "fleet-monitor-${stdenvNoCC.hostPlatform.system}";
in stdenvNoCC.mkDerivation {
  pname = "fleet-monitor";
  version = lib.removePrefix "v" release.version;
  src = fetchurl {
    url = "https://github.com/ImLunaHey/fleet-monitor/releases/download/${release.version}/${asset}";
    hash = release.assets.${asset};
  };
  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;
  dontStrip = true;
  installPhase = ''install -Dm755 "$src" "$out/bin/fleet-monitor"'';
  meta = { description = "Read-only fleet hardware telemetry"; license = lib.licenses.mit; mainProgram = "fleet-monitor"; platforms = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ]; };
}

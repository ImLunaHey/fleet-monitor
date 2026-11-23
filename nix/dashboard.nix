{ lib, stdenvNoCC, fetchurl }:
let
  release = builtins.fromJSON (builtins.readFile ./release.json);
  asset = "fleet-monitor-dashboard.html";
in stdenvNoCC.mkDerivation {
  pname = "fleet-monitor-dashboard";
  version = lib.removePrefix "v" release.version;
  src = fetchurl {
    url = "https://github.com/ImLunaHey/fleet-monitor/releases/download/${release.version}/${asset}";
    hash = release.assets.${asset};
  };
  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;
  installPhase = ''install -Dm644 "$src" "$out/index.html"'';
  meta = { description = "React fleet hardware dashboard"; license = lib.licenses.mit; };
}

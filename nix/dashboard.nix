{ lib, buildNpmPackage, nodejs_22 }:
buildNpmPackage {
  pname = "fleet-monitor-dashboard";
  version = "0.1.0";
  src = lib.cleanSource ../web;
  nodejs = nodejs_22;
  npmDepsHash = "sha256-7hnGAD/Z4Dr0PzB12WfL0ZZKNS6ZXb6OQfQuZCaSzzM=";
  doCheck = true;
  checkPhase = ''runHook preCheck; npm test; runHook postCheck'';
  installPhase = ''mkdir -p "$out"; cp dist/index.html "$out/index.html"'';
  meta = { description = "React fleet hardware dashboard"; license = lib.licenses.mit; };
}

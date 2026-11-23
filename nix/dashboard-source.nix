{ lib, buildNpmPackage, nodejs_22 }:
buildNpmPackage {
  pname = "fleet-monitor-dashboard";
  version = "0.1.0";
  src = lib.cleanSource ../web;
  nodejs = nodejs_22;
  npmDepsHash = "sha256-MDw1mMF7gP4Db8SKJRHc7Yhm1bncG/czfPdEDXhCrD8=";
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run typecheck
    npm run lint
    npm run format:check
    npm run test:coverage
    runHook postCheck
  '';
  installPhase = ''mkdir -p "$out"; cp dist/index.html "$out/index.html"'';
  meta = { description = "React fleet hardware dashboard"; license = lib.licenses.mit; };
}

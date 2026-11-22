{ lib, buildGoModule }:
buildGoModule {
  pname = "fleet-monitor";
  version = "0.1.0";
  src = lib.cleanSource ../collector;
  vendorHash = "sha256-szHwC68zQUD87ZB4Dy+loGFbTw7Y3XkXLSxFhB0w3Gk=";
  env.CGO_ENABLED = "0";
  meta = { description = "Read-only fleet hardware telemetry"; license = lib.licenses.mit; mainProgram = "fleet-monitor"; platforms = lib.platforms.linux ++ lib.platforms.darwin; };
}

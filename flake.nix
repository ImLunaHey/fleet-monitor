{
  description = "A passive fleet dashboard and read-only hardware agents for NixOS and macOS";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/f4a03c008967841f2a0b3cb7c436fc6fc31671f6";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      eachSystem = nixpkgs.lib.genAttrs systems;
    in {
      packages = eachSystem (system: let pkgs = import nixpkgs { inherit system; }; in {
        collector = pkgs.callPackage ./nix/collector.nix { };
        dashboard = pkgs.callPackage ./nix/dashboard.nix { };
        collector-source = pkgs.callPackage ./nix/collector-source.nix { };
        dashboard-source = pkgs.callPackage ./nix/dashboard-source.nix { };
        default = self.packages.${system}.collector;
      });
      checks = eachSystem (system: {
        collector = self.packages.${system}.collector-source;
        dashboard = self.packages.${system}.dashboard-source;
      });
      nixosModules.default = import ./nix/nixos.nix;
      darwinModules.default = import ./nix/darwin.nix;
      devShells = eachSystem (system: let pkgs = import nixpkgs { inherit system; }; in {
        default = pkgs.mkShell { packages = [ pkgs.go pkgs.nodejs_22 ]; };
      });
    };
}

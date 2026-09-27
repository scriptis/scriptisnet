{
  description = "scriptisnet - a personal website and blog, built with Zola";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      # x86_64-darwin is absent on purpose: nixos-unstable no longer
      # evaluates for it.
      allSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      forAllSystems =
        f:
        nixpkgs.lib.genAttrs allSystems (
          system:
          let
            pkgs = nixpkgs.legacyPackages.${system};
            perSystem = import ./nix/per-system.nix { inherit system pkgs; };
          in
          f ({ inherit system pkgs; } // perSystem)
        );
    in
    {
      packages = forAllSystems (attrs: attrs.packages);

      devShells = forAllSystems (attrs: {
        default = import ./nix/devshell.nix {
          inherit (attrs) pkgs packages;
        };
      });
    };
}

# Per-system attrset assembled by flake.nix's forAllSystems. Grows as the
# project does - each piece arrives with its first consumer, not ahead of it.
{ pkgs, ... }:
{
  packages = {
    # The published site, as CI deploys it.
    site = import ./site.nix { inherit pkgs; };
    # Formats the tree with the pinned formatters.
    fmt = import ./scripts/fmt.nix { inherit pkgs; };
    # Rebuilds the vendored web fonts from the pinned nixpkgs.
    vendor-fonts = import ./scripts/vendor-fonts.nix { inherit pkgs; };
    # The gate, in two tiers of the same stages: `--hook` at commit time
    # and in CI, and the full run (outbound links included) before
    # publishing and weekly in CI. Also what the pre-commit hook runs.
    audit = import ./scripts/audit.nix { inherit pkgs; };
  };
}

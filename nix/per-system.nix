# Per-system attrset assembled by flake.nix's forAllSystems. Grows as the
# project does (a site package, a deployment module) - each piece arrives with
# its first consumer, not ahead of it.
{ pkgs, ... }:
{
  packages = {
    # Formats the tree with the pinned formatters.
    fmt = import ./scripts/fmt.nix { inherit pkgs; };
    # Rebuilds the vendored web fonts from the pinned nixpkgs.
    vendor-fonts = import ./scripts/vendor-fonts.nix { inherit pkgs; };
    # The gate, in two tiers of the same stages: `--hook` at commit time,
    # and the full run (outbound links included) before publishing. Also
    # what the pre-commit hook runs.
    audit = import ./scripts/audit.nix { inherit pkgs; };
  };
}

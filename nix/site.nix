# `nix build .#site`: the published site, as it deploys - built from the
# flake's copy of site/ (tracked files only), without drafts, by the pinned
# Zola. CI uploads exactly this to GitHub Pages, and anything else that
# serves the site can take the same derivation.
#
# Built in the writable copy stdenv unpacks rather than in place: Zola's
# resize_image writes its cache into static/processed_images/ in the source
# tree, which the store's read-only copy would refuse.
{ pkgs }:

pkgs.stdenvNoCC.mkDerivation {
  name = "scriptisnet-site";
  src = ../site;
  nativeBuildInputs = [
    pkgs.zola
    # Zola builds an HTTPS client at start-up, for its load_data function,
    # and panics when there are no CA certificates to load - in the sandbox,
    # there are none. The site fetches nothing; this is only so it starts.
    pkgs.cacert
  ];
  buildPhase = ''
    runHook preBuild
    zola build --output-dir "$out"
    runHook postBuild
  '';
  dontInstall = true;
  dontFixup = true;
}

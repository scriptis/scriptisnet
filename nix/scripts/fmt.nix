# `nix run .#fmt` (and the devshell `fmt` command): format every tracked file
# with the pinned formatters, one per language, because no single formatter
# covers this stack:
#
#   * nixfmt   - `*.nix`
#   * mdformat - `*.md` (nix/mdformat.nix says with which plugins, how wide,
#                and why content front matter is YAML)
#   * biome    - the web stack: JS/TS, JSON, plain CSS (biome.json)
#   * prettier - `*.scss`. Biome does not parse SCSS at all; it refuses the
#                first `$variable`.
#   * djlint   - Tera templates under `site/templates/` (.djlintrc). Biome's
#                HTML formatter reads `{% ... %}` as text and reflows tags
#                together; djlint knows Jinja-family syntax, including Tera
#                2's `{{ <component /> }}` forms, and is idempotent on them.
#
# Which files each one owns is nix/filesets.nix, shared with the audit, whose
# `fmt-*` stages check exactly what this rewrites.
{ pkgs }:

let
  mdformat = import ../mdformat.nix { inherit pkgs; };
  files = import ../filesets.nix;
in
pkgs.writeShellApplication {
  name = "fmt";
  runtimeInputs = [
    pkgs.git
    pkgs.nixfmt
    mdformat.env
    pkgs.biome
    pkgs.prettier
    pkgs.djlint
  ];
  text = ''
    cd "$(git rev-parse --show-toplevel)"
    echo "==> nixfmt (tracked *.nix)" >&2
    git ls-files -z '*.nix' | xargs -0 -r nixfmt
    echo "==> mdformat (tracked *.md, 120 columns)" >&2
    git ls-files -z '*.md' | xargs -0 -r mdformat ${mdformat.args}
    echo "==> biome (tracked JS/TS/JSON/CSS)" >&2
    git ls-files -z ${files.args files.web} \
      | xargs -0 -r biome format --write --no-errors-on-unmatched
    echo "==> prettier (tracked *.scss)" >&2
    git ls-files -z '*.scss' | xargs -0 -r prettier --write --log-level warn
    echo "==> djlint (tracked templates)" >&2
    # `djlint --reformat` exits 1 whenever it changed a file, so a failure
    # there is not an error by itself; the `--check` that follows is, since
    # it fails only if something is still unformatted after the rewrite.
    mapfile -d "" templates < <(git ls-files -z ${files.args files.templates})
    if [ "''${#templates[@]}" -gt 0 ]; then
      djlint --reformat --quiet "''${templates[@]}" \
        || djlint --check --quiet "''${templates[@]}"
    fi
  '';
}

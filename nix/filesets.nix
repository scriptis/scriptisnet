# Which tracked files each tool is responsible for, as git pathspecs, stated
# once for `fmt` (nix/scripts/fmt.nix) and the audit (nix/scripts/audit.nix):
# the formatter that rewrites a file and the stage that checks it must agree
# on the list, or a file is formatted and never checked, or checked and never
# formattable. A git pathspec's `*` matches across `/`, so each entry reaches
# every directory.
#
# The edit-time ASCII hook's extension list in .claude/settings.json is the one
# copy that cannot import this; keep it in step with `ascii` below.
let
  # JS/TS, JSON and plain CSS: biome's.
  web = [
    "*.js"
    "*.mjs"
    "*.cjs"
    "*.jsx"
    "*.ts"
    "*.mts"
    "*.tsx"
    "*.json"
    "*.jsonc"
    "*.css"
  ];
in
{
  inherit web;
  # Shell sources: shellcheck's, and ASCII's.
  shell = [
    "*.sh"
    ".githooks/*"
  ];
  # Tera templates: djlint's.
  templates = [ "site/templates/*.html" ];
  # What biome cannot parse and prettier can: SCSS, and YAML (the CI
  # workflow).
  prettier = [
    "*.scss"
    "*.yml"
    "*.yaml"
  ];
  # Every source file the ASCII rule covers. Markdown is prose and exempt.
  ascii = web ++ [
    "*.nix"
    "*.toml"
    "*.sh"
    ".githooks/*"
    "*.scss"
    "*.html"
    "*.yml"
    "*.yaml"
  ];
  # Joined for interpolation into a shell command line; every entry is a
  # quoted literal, so the shell passes the glob to git rather than expanding
  # it.
  args = list: builtins.concatStringsSep " " (map (p: "'${p}'") list);
}

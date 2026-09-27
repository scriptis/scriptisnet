# `nix run .#audit` (and the devshell `audit` command): the gate.
#
# One script is the whole verification story, so "did the pre-commit hook
# pass" and "did the agent check its work" are the same question with the
# same answer. Every stage runs even after an earlier one fails - an audit
# reports everything wrong, not the first thing - and the exit code is the
# union.
#
# # Two tiers, which are selections of these stages and not two scripts
#
#   audit --hook   The commit-time tier, and what `.githooks/pre-commit`
#                  runs: every stage that reads only this tree. The
#                  formatters in check mode, biome's linter, `bun test`, deadnix and
#                  statix, shellcheck, `ascii`, the site build, and the
#                  internal link check. A few seconds warm; nothing in it
#                  needs the network, so a commit never waits on someone
#                  else's server.
#   audit          Everything above plus `links-external`, which fetches
#                  every outbound link the site makes. Run before
#                  publishing. It is not in the hook because its verdict
#                  depends on the rest of the internet: a link that rots
#                  overnight would block a commit that did not touch it.
#
# The rule for the boundary: the hook tier holds what costs a *whole commit*
# to undo once more work is stacked on it - a formatting slip, a non-ASCII
# byte, a template that no longer renders, an internal link that stopped
# resolving. Nothing in it can go red without the tree changing.
#
# The stages, and what each one holds still:
#
#   fmt-nix, fmt-md, fmt-web, fmt-prettier, fmt-templates
#                the five formatters `fmt` runs (nix/scripts/fmt.nix), in
#                check mode, over the same files (nix/filesets.nix) with
#                the same settings. A clean `fmt` is what makes these green.
#   lint-web     biome's linter over the JS/TS/JSON/CSS the interactive
#                examples are made of.
#   test         `bun test`: the site's scripts' logic, headless - today the
#                crystal's slab geometry, the CPU twin of its shader.
#   deadnix, statix
#                unused Nix bindings, and Nix anti-patterns.
#   shellcheck   the tracked shell sources, the pre-commit hook and the
#                edit-time ASCII hook among them. (Scripts built with
#                `writeShellApplication`, this one included, are
#                shellchecked by their own build.)
#   ascii        every tracked source file the rule covers is ASCII, with
#                no exceptions; see the working agreement and
#                .claude/scripts/strip-non-ascii.sh, which is the edit-time
#                copy of this rule and must refuse the same bytes.
#   site         `zola build` into a scratch directory: every template and
#                every page renders, as published (drafts excluded), and
#                Zola warns about nothing.
#   links        `zola check --skip-external-links`: internal links and
#                anchors resolve.
#   links-external
#                (full tier only) `zola check` with outbound links fetched.
{ pkgs }:

let
  mdformat = import ../mdformat.nix { inherit pkgs; };
  files = import ../filesets.nix;
in
pkgs.writeShellApplication {
  name = "audit";
  # The gate does not borrow anything from the machine running it. By default
  # `writeShellApplication` *prepends* `runtimeInputs` to `PATH`, so an
  # undeclared tool silently resolves against the host, and the gate one
  # machine runs is a different program from the gate another runs. Everything
  # this script calls is named below, and this line keeps that list honest: a
  # tool dropped from it fails here rather than somewhere else.
  inheritPath = false;
  runtimeInputs = [
    pkgs.coreutils
    pkgs.findutils
    pkgs.gnugrep
    pkgs.git
    pkgs.nixfmt
    pkgs.deadnix
    pkgs.statix
    pkgs.shellcheck
    mdformat.env
    pkgs.biome
    pkgs.prettier
    pkgs.djlint
    pkgs.zola
    pkgs.bun
  ];
  text = ''
    # The stamp. A copy of this script on PATH is a *build* of it, and goes
    # stale the moment the file is edited - a stale copy runs a narrower gate
    # than the tree holds and reports green for it. So the first line names
    # the build actually running: its own store path, the tier, and the
    # number of `stage` calls this build's text contains. Two builds that
    # differ in any stage differ on line one.
    stamp() {
      echo "audit: build $0, $1 tier, $(grep -cE '^[[:space:]]*stage "' "$0") stages known" >&2
    }

    cd "$(git rev-parse --show-toplevel)"

    tier=full
    for arg in "$@"; do
      case "$arg" in
        --hook) tier=hook ;;
        *)
          echo "audit: unknown flag '$arg' (known: --hook)" >&2
          exit 2
          ;;
      esac
    done
    stamp "$tier"

    failed=()

    # ---- what the run cost, per stage -----------------------------------
    #
    # Every stage reports its own wall time as it closes, and the run ends
    # with the same numbers sorted, so "the gate got slow" names a stage.
    # Milliseconds as integers in bash's own arithmetic: `$EPOCHREALTIME` is
    # formatted with the locale's decimal separator. A stage is closed by the
    # next one starting, which is also what times a failed one; the last is
    # closed by hand before the table.
    began=$(date +%s%3N)
    stage_names=()
    stage_costs=()
    open_stage=""
    open_since=0
    spent() {
      printf '%d.%03d' "$(( $1 / 1000 ))" "$(( $1 % 1000 ))"
    }
    closed() {
      [ -n "$open_stage" ] || return 0
      local took
      took=$(( $(date +%s%3N) - open_since ))
      echo "<== $(spent "$took")s  $open_stage" >&2
      stage_names+=("$open_stage")
      stage_costs+=("$took")
      open_stage=""
    }
    stage() {
      closed
      echo >&2
      echo "==> $1" >&2
      open_stage="$1"
      open_since=$(date +%s%3N)
    }
    fail() {
      failed+=("$1")
      echo "audit: stage '$1' FAILED" >&2
    }

    # Scratch space for the site build, removed however the script exits.
    scratch=$(mktemp -d)
    trap 'rm -rf "$scratch"' EXIT

    stage "fmt-nix: nixfmt --check (tracked *.nix)"
    git ls-files -z '*.nix' | xargs -0 -r nixfmt --check || fail "fmt-nix"

    stage "fmt-md: mdformat --check (tracked *.md, 120 columns)"
    git ls-files -z '*.md' | xargs -0 -r mdformat --check ${mdformat.args} || fail "fmt-md"

    stage "fmt-web: biome format (tracked JS/TS/JSON/CSS)"
    git ls-files -z ${files.args files.web} \
      | xargs -0 -r biome format --no-errors-on-unmatched || fail "fmt-web"

    stage "lint-web: biome lint (tracked JS/TS/JSON/CSS)"
    git ls-files -z ${files.args files.web} \
      | xargs -0 -r biome lint --no-errors-on-unmatched || fail "lint-web"

    stage "fmt-prettier: prettier --check (tracked SCSS and YAML)"
    git ls-files -z ${files.args files.prettier} | xargs -0 -r prettier --check --log-level warn || fail "fmt-prettier"

    stage "fmt-templates: djlint --check (tracked templates)"
    git ls-files -z ${files.args files.templates} \
      | xargs -0 -r djlint --check --quiet || fail "fmt-templates"

    stage "test: bun test (the headless twins of the site's scripts)"
    # The crystal's slab geometry (site/static/js/crystal/slab.js) and
    # whatever joins it: logic a browser runs, checked without one.
    bun test || fail "test"

    stage "deadnix: unused declarations (tracked *.nix)"
    git ls-files -z '*.nix' | xargs -0 -r deadnix --fail || fail "deadnix"

    stage "statix: anti-patterns"
    statix check . || fail "statix"

    stage "shellcheck: tracked shell sources"
    git ls-files -z ${files.args files.shell} | xargs -0 -r shellcheck || fail "shellcheck"

    stage "ascii: tracked sources, no exceptions"
    ascii_ok=1
    while IFS= read -r -d "" file; do
      if grep -qP '[^\x00-\x7F]' "$file"; then
        echo "non-ASCII in $file:" >&2
        grep -nP '[^\x00-\x7F]' "$file" | head -5 >&2
        ascii_ok=0
      fi
    done < <(git ls-files -z ${files.args files.ascii})
    [ "$ascii_ok" = 1 ] || fail "ascii"

    stage "site: zola build (as published, into scratch), warnings fatal"
    # Zola reports some real losses only as a warning and still exits 0 - a
    # post with no `date` in a date-sorted section is left out of the site
    # entirely - so a WARN line fails the stage as surely as an error does.
    if zola --root site build --output-dir "$scratch/public" 2>&1 | tee "$scratch/build.log"; then
      if grep -q '^WARN' "$scratch/build.log"; then
        echo "audit: zola build warned; a warning here is a page or asset left out" >&2
        fail "site"
      fi
    else
      fail "site"
    fi

    stage "links: zola check --skip-external-links"
    zola --root site check --skip-external-links || fail "links"

    if [ "$tier" = full ]; then
      stage "links-external: zola check (fetches every outbound link)"
      zola --root site check || fail "links-external"
    fi

    closed

    # Where the run went, most expensive first. Printed before the verdict
    # and never after it: the verdict is the last line on purpose, because
    # that is where a person scanning a log looks.
    if [ "''${#stage_names[@]}" -gt 0 ]; then
      total=0
      for cost in "''${stage_costs[@]}"; do
        total=$(( total + cost ))
      done
      ran=$(( $(date +%s%3N) - began ))
      echo >&2
      echo "audit: where the time went" >&2
      for at in "''${!stage_names[@]}"; do
        printf '%012d\t%s\t%s\n' \
          "''${stage_costs[$at]}" "$(spent "''${stage_costs[$at]}")" "''${stage_names[$at]}"
      done | sort -rn | while IFS="$(printf '\t')" read -r _ took name; do
        printf '  %8ss  %s\n' "$took" "$name" >&2
      done
      echo "  $(spent "$total")s  ''${#stage_names[@]} stages" >&2
      echo "  $(spent "$ran")s  the whole run" >&2
    fi

    echo >&2
    if [ "''${#failed[@]}" -gt 0 ]; then
      echo "audit: FAILED stages: ''${failed[*]}" >&2
      exit 1
    fi
    echo "audit: all stages green" >&2
  '';
}

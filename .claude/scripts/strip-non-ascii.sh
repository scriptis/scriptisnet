#!/usr/bin/env bash
# Keep source files ASCII, per the working agreement.
#
# Two passes with different powers, because the two failure modes differ:
#
#   1. Typographic substitutions (em-dash, en-dash, ellipsis, right arrow)
#      have exact equivalents, so they are rewritten in place.
#   2. Anything else - a glyph from another script, a math sign - has no
#      mechanical equivalent, and only the author knows what was meant, so it
#      is reported and left alone.
#
# Invoked from the PostToolUse hook on Edit/Write/MultiEdit (see
# .claude/settings.json for which files), or by hand. The `ascii` stage of the
# audit (nix/scripts/audit.nix) is the gate; this is the early warning, and
# the two must refuse the same bytes.
#
# Usage: strip-non-ascii.sh <file-path>
# Exit 0: nothing to do.
# Exit 2: rewritten and/or something needs a person; stderr goes to the agent.

set -euo pipefail

file="${1:-}"
[[ -z "$file" || ! -f "$file" ]] && exit 0

# The hook scopes this by extension, not by directory, so it fires on any
# matching file an agent edits - including checkouts outside this project.
# Rewriting characters in someone else's source produces changes nobody asked
# for. Confine it to this project.
case "$(realpath -m "$file")" in
  "$(realpath -m "${CLAUDE_PROJECT_DIR:-.}")"/*) ;;
  *) exit 0 ;;
esac

rewrote=0
flagged=""

# -- pass 1: substitutions with an exact equivalent -------------------------
#
# Byte-level pre-check (fast, locale-free) so the rewrite path is skipped when
# there is nothing to replace.
#   \xe2\x80\x94  em-dash
#   \xe2\x80\x93  en-dash
#   \xe2\x80\xa6  ellipsis
#   \xe2\x86\x92  right arrow
if LC_ALL=C grep -qE $'\xe2\x80\x94|\xe2\x80\x93|\xe2\x80\xa6|\xe2\x86\x92' "$file"; then
  # The characters are written as escapes rather than as themselves, because
  # this file is a tracked source file and the rule it enforces covers it too.
  # `$'...'` is ANSI-C quoting: bash expands the escape and sed receives the
  # bytes.
  em_dash=$'\u2014'
  en_dash=$'\u2013'
  ellipsis=$'\u2026'
  right_arrow=$'\u2192'

  # The plain ASCII spelling, in page copy as much as in comments: the site's
  # rendered text is ASCII by preference too, so a template's dash becomes a
  # hyphen, not an entity that draws the dash anyway. Em-dash handling, three
  # independent rules:
  #   1. Leading  - em-dash as first content char on the line, after an
  #                 optional comment marker and whitespace, becomes `--`.
  #   2. Middle   - ` <em-dash> ` anywhere becomes ` - `.
  #   3. Trailing - ` <em-dash>` at end of line becomes ` -`.
  LC_ALL=C.UTF-8 sed -i -E \
    -e "s/^([ \t]*(\/\/+!?|#+!?|\/\*+|\*)?[ \t]*)${em_dash}[ \t]*/\1-- /" \
    -e "s/ $em_dash / - /g" \
    -e "s/ $em_dash\$/ -/" \
    -e "s/$em_dash/--/g" \
    -e "s/$en_dash/-/g" \
    -e "s/$ellipsis/.../g" \
    -e "s/$right_arrow/->/g" \
    "$file"
  rewrote=1
fi

# -- pass 2: everything else, which has to be escaped by hand ---------------
#
# Every remaining non-ASCII byte, with no carve-out: an exemption list here
# would be a second, laxer rule running before the gate's, and the gate's is
# the one that decides whether work lands. A character wanted for its bytes
# is written as an escape, so what the browser or program receives is
# identical and the file stays checkable by one grep.
if flagged=$(grep -nP '[^\x00-\x7F]' "$file" 2>/dev/null); then
  {
    echo "strip-non-ascii: $file still contains non-ASCII after the rewrites above."
    echo "Source here is ASCII with no exceptions. Typography - quotes, dashes -"
    echo "takes its ASCII spelling, in page copy too. A character with none that is"
    echo "genuinely wanted is written as an escape, so the output is unchanged: an"
    # printf, not echo: the backslashes are the message, not escapes.
    printf '%s\n' "HTML entity in a template, \\00e9 in CSS, \\u00e9 in JS/TS/JSON/TOML, \$'\\u00e9' in shell."
    echo "$flagged"
  } >&2
  exit 2
fi

if [[ "$rewrote" -eq 1 ]]; then
  echo "strip-non-ascii: rewrote dash/ellipsis/arrow to ASCII in $file" >&2
  exit 2
fi

exit 0

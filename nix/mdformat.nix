# `mdformat` with the plugins this site's Markdown needs, as one environment
# shared by `fmt` (nix/scripts/fmt.nix) and the devshell, so the formatter an
# editor runs and the one `fmt` runs cannot be two versions.
#
# `mdformat` is a strict CommonMark formatter; each plugin teaches it a piece
# of syntax Zola's renderer accepts and plain CommonMark does not:
#
#   * `mdformat-gfm` - tables, strikethrough, task lists, as tables and not
#     as prose with escaped pipes.
#   * `mdformat-footnote` - `[^1]` references and definitions.
#   * `mdformat-frontmatter` - the front matter block every page opens with.
#     It understands YAML (`---`) only: a TOML (`+++`) block is read as a
#     paragraph and reflowed into one line, which destroys it. Zola accepts
#     either, so content uses YAML front matter - that is the whole reason.
#     The block is parsed and re-dumped by `ruamel.yaml`, not left
#     byte-for-byte alone, so values survive but spelling may be normalized.
#
# Scope and width are properties of the tree, stated once here:
#
#   * every tracked `.md` - posts, section indexes, and the repository's own
#     prose alike.
#   * 120 columns (`.editorconfig` says the same for `*.md`).
#   * `--number` keeps an ordered list numbered 1, 2, 3 in the source, which
#     is what a person reading the raw file expects.
#   * `--compact-tables` leaves table cells unpadded, so one long cell does
#     not pad every row of its column out to the same width.
#
# Content is also a Tera template (Zola 0.23+). mdformat treats a block
# component's opening and closing tags as paragraph text and joins them with
# an unpadded body onto one line; keep a blank line after the opening tag and
# before the closing one, which is also what makes Zola render the body as
# Markdown at all.
{ pkgs }:
{
  env = pkgs.python3.withPackages (ps: [
    ps.mdformat
    ps.mdformat-gfm
    ps.mdformat-footnote
    ps.mdformat-frontmatter
  ]);
  args = "--wrap 120 --number --compact-tables";
}

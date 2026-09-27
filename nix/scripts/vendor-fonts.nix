# `nix run .#vendor-fonts`: rebuild the site's vendored web fonts in
# site/static/fonts/ from the fonts in the pinned nixpkgs, so the committed
# files are reproducible from flake.lock rather than downloads nobody can
# retrace. Run it after a nixpkgs bump that moves a font, and commit what it
# writes. site/sass/_fonts.scss has an @font-face rule per file.
#
# The faces: DejaVu Serif for display (the wordmark, headings), DejaVu Sans
# for body text in its four styles, and Fira Code for code.
#
# Each is cut to WOFF2 subset to the Latin range below - the range the
# site's copy is written in. The full DejaVu Serif is 380 KB of TrueType
# carrying Greek, Cyrillic, maths and more, which English text never draws.
# A character outside the range falls back down the face's stack in
# _tokens.scss rather than failing, and each @font-face's unicode-range says
# the same thing to the browser, so it never fetches a file for text it
# cannot set.
#
# Hinting - instructions for snapping outlines to the pixel grid at small
# sizes - is kept for the text faces, which run at text size where Windows
# still reads it, and dropped for the display face, which never does: it is
# half that file (the Latin subset of DejaVu Serif 2.37 is 24 KB hinted and
# 12 KB without).
#
# Fira Code keeps every OpenType feature it has, not just the default set:
# its ligatures are contextual alternates (`calt`), and its stylistic sets
# are there to be switched on from CSS.
#
# The licenses travel with the files.
#   * DejaVu's is Bitstream Vera's, which permits modifying the fonts -
#     subsetting is modifying - provided the result is not named with
#     "Bitstream" or "Vera" (nor, for the glyphs from Arev, "Arev" or
#     "Tavmjong Bah"). "DejaVu" is none of those. LICENSE-DejaVu.txt is the
#     source's own file.
#   * Fira Code's is the SIL Open Font License 1.1, which restricts only the
#     Reserved Font Names a copyright line declares, and Fira Code's
#     declares none, so a subset may keep its name. The OFL must accompany
#     the font; the release archive does not carry its text, so
#     LICENSE-FiraCode.txt is the font's own copyright line (its name table,
#     record 0) above the OFL 1.1 text from nixpkgs' SPDX license data.
{ pkgs }:

let
  python = pkgs.python3.withPackages (ps: [
    ps.fonttools
    ps.brotli
  ]);
  dejavu = "${pkgs.dejavu_fonts}/share/fonts/truetype";
  firaCode = "${pkgs.fira-code.src}/ttf";
  ofl = "${pkgs.spdx-license-list-data.text}/text/OFL-1.1.txt";
  # The Latin range, as the major font services cut it: ASCII and Latin-1,
  # the few extra letters and modifiers Western European text reaches for,
  # general punctuation (dashes, curly quotes, the ellipsis), the euro, the
  # trademark, two arrows and the true minus. _fonts.scss repeats it.
  latin = builtins.concatStringsSep "," [
    "U+0000-00FF"
    "U+0131"
    "U+0152-0153"
    "U+02BB-02BC"
    "U+02C6"
    "U+02DA"
    "U+02DC"
    "U+0304"
    "U+0308"
    "U+0329"
    "U+2000-206F"
    "U+20AC"
    "U+2122"
    "U+2191"
    "U+2193"
    "U+2212"
    "U+2215"
    "U+FEFF"
    "U+FFFD"
  ];
in
pkgs.writeShellApplication {
  name = "vendor-fonts";
  runtimeInputs = [
    pkgs.git
    pkgs.coreutils
    python
  ];
  text = ''
    cd "$(git rev-parse --show-toplevel)"
    out=site/static/fonts
    mkdir -p "$out"

    # cut <source.ttf> <output name> [extra pyftsubset flags...]
    cut() {
      local source=$1 name=$2
      shift 2
      echo "==> $name" >&2
      pyftsubset "$source" \
        --unicodes="${latin}" \
        --flavor=woff2 \
        --output-file="$out/$name-latin.woff2" \
        "$@"
    }

    cut "${dejavu}/DejaVuSerif.ttf" DejaVuSerif --no-hinting --desubroutinize
    cut "${dejavu}/DejaVuSans.ttf" DejaVuSans
    cut "${dejavu}/DejaVuSans-Bold.ttf" DejaVuSans-Bold
    cut "${dejavu}/DejaVuSans-Oblique.ttf" DejaVuSans-Oblique
    cut "${dejavu}/DejaVuSans-BoldOblique.ttf" DejaVuSans-BoldOblique
    cut "${firaCode}/FiraCode-Regular.ttf" FiraCode --layout-features='*'

    install -m 644 "${pkgs.dejavu_fonts.full-ttf.src}/LICENSE" "$out/LICENSE-DejaVu.txt"
    {
      python -c 'import sys; from fontTools.ttLib import TTFont; print(TTFont(sys.argv[1])["name"].getDebugName(0))' \
        "${firaCode}/FiraCode-Regular.ttf"
      echo
      cat "${ofl}"
    } > "$out/LICENSE-FiraCode.txt"
    chmod 644 "$out/LICENSE-FiraCode.txt"
    ls -l "$out" >&2
  '';
}

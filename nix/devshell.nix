{
  pkgs,
  packages ? { },
}:
let
  mdformat = import ./mdformat.nix { inherit pkgs; };
in
pkgs.mkShell {
  packages =
    (with pkgs; [
      git
      # The static site generator. Its Sass compiler (grass) is built in, so
      # `sass/` needs no separate dart-sass.
      zola
      # Runtime and bundler for the interactive examples some posts carry.
      bun
      # The formatters `fmt` runs, on PATH as well so an editor's
      # format-on-save uses the same pinned versions; nix/scripts/fmt.nix
      # says which covers what and why it takes five.
      nixfmt
      biome
      prettier
      djlint
    ])
    ++ [ mdformat.env ]
    ++ pkgs.lib.attrValues packages;

  shellHook = ''
    export REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

    # The project's own commands outrank everything, explicitly. Without
    # this, coreutils' `fmt` - the paragraph reflower, which reads stdin when
    # given no file - can shadow the project's fmt, so `fmt` silently formats
    # nothing, and hangs the first time stdin never closes. Precedence stated
    # here makes a collision with a coreutil structural rather than a mystery.
    export PATH="${pkgs.lib.makeBinPath (pkgs.lib.attrValues packages)}''${PATH:+:$PATH}"

    # Route Git hooks to the committed .githooks/, so every commit passes
    # through the audit's commit-time tier. Entering the devshell is what
    # arms the gate.
    git config core.hooksPath .githooks 2>/dev/null || true
  '';
}

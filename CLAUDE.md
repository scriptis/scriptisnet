# Working agreement

Default conventions for agents working in this repository. Where a specific instruction conflicts with something here,
that wins.

## What this repository is

A personal website and blog (scriptis.net), built as a Zola static site. The product is the writing and how it reads:
typography, layout, and the page staying fast and small. Treat a visual regression as seriously as a broken build.

- **Stack.** The Zola site lives in `site/`: `zola.toml`, Markdown content with YAML front matter under `content/`, Tera
  templates and components in `templates/`, SCSS in `sass/`, files copied verbatim from `static/`. Run Zola from the
  repository root as `zola --root site <cmd>`; `build` writes to `site/public/`, which is never committed. The rest of
  the root is tooling (`nix/`, the formatter configs, `.githooks/`). Some posts carry small interactive examples; their
  JS/TS is built with `bun`.
- **The theme is our own, built from scratch** in `site/templates/` and `site/sass/` - no third-party Zola theme, and no
  CSS framework. Design decisions are made together and recorded where they live (a comment in the partial, the commit
  message). It is dark-only: dark blues, an 800px centered column, and every color, face, and measure a custom property
  in `site/sass/_tokens.scss`. The crystal (`site/static/js/crystal/`) is the site's motif: hung in the margin before
  the wordmark, as tall as its line (`.Mark`) - large in the home page's hero, small in every other page's header
  (`base.html`, block `mark`).
- **Fonts are vendored, and rebuilt, not downloaded.** `nix run .#vendor-fonts` cuts the site's faces - DejaVu Serif for
  the wordmark and headings, DejaVu Sans for body text, Fira Code (ligatures on) for code - from the pinned nixpkgs into
  `site/static/fonts/` as Latin-subset WOFF2, with their licenses beside them; commit what it writes.
  `nix/scripts/vendor-fonts.nix` has the reasoning, and `site/sass/_fonts.scss` the matching `@font-face` rules.
- **SCSS is BEM, with PascalCase names:** `Block`, `Block__Element`, `Block__Element--modifier` - `Hero`,
  `Hero__Wordmark`, `SiteNav__Link--external`. Nesting with `&__Element` is fine; the point is that every class in the
  page names the one rule that styles it, which is what makes it easy to debug. A class that two places share is its own
  block, mixed in beside the positional one (`class="Hero__Wordmark Wordmark"`); a component that takes a mix has a
  `mix` argument. Element selectors appear only in `_base.scss` (bare-element defaults) and inside `.Prose`, whose
  Markdown-rendered markup carries no classes to hang anything on.
- **Why Zola.** A single pinned binary with Sass compilation, syntax highlighting, feeds, and a link checker built in -
  no runtime. The web toolchain exists for the interactive examples, not for the site itself; add a moving part only
  when a page needs one.
- **The pinned Zola is 0.23: Tera 2, and no shortcodes.** Zola 0.22 and earlier embed Tera 1 and have shortcodes, and
  almost every template, theme, and answer you will find or remember is written for them. In 0.23 every page is itself a
  Tera template and reusable pieces are Tera components. **Load the `zola` skill** (`.claude/skills/zola/`) before
  touching templates, content syntax, or config; it has the differences, this site's conventions, and how to read the
  pinned sources.
- **Front matter is YAML, not Zola's usual TOML,** because the Markdown formatter can only parse YAML front matter and
  wrecks a TOML block (`nix/mdformat.nix` has the detail). Zola supports both.
- **Zola compiles Sass with `grass`,** which is stricter than dart-sass in places (e.g. `adjust-color`'s `$alpha` must
  be a bare number in -1..1, not a percentage). A snippet that works on a dart-sass playground is not evidence.

## Documentation & source of truth

- **The repository is the single source of truth; keep committed artifacts self-contained.** READMEs, code comments, and
  commit messages must stand on their own - never point at anything outside the repo: not another repo, not a path on
  someone's machine, not a private memory or notes store. A fresh clone with no other context must be enough to
  understand them; if outside context matters, inline the substance instead of linking out. (Using your own memory or
  the conversation as *working* context is fine - just don't leak pointers to it into committed files.)
- **Inline documentation documents the code, in place and verbatim.** A comment on a template block, a Nix attribute, or
  a Sass partial says what it does and why, written out where it lives. The header comments under `nix/` are the model:
  the reason a thing is the way it is sits next to the thing.
- **Persist durable context before it's lost.** Long sessions get compacted; capture non-obvious decisions, deferred
  TODOs, and "why X over Y" reasoning before that happens - in the comment beside what it governs if it is about one
  thing, in the commit message if it is about a change. Filter for "would this be regretted if the session ended right
  now?"

## Interaction

- **Treat design as a conversation, not dictation.** Surface trade-offs, alternatives, and risks; push back with
  reasoning when something looks wrong. Once a decision is reached, commit to it, and record the rationale (including
  the alternatives weighed) so the reasoning is durable.
- **Never use the `AskUserQuestion` tool.** Ask in plain prose inline, with a recommendation rather than an open-ended
  survey. (`EnterPlanMode` / `ExitPlanMode` are fine - they're separate.)
- **Blog prose is the author's.** Don't rewrite or "tighten" post content unless asked; fix only what you were asked to
  fix, and point out anything else - a typo, a non-en-US spelling - rather than changing it.

## Subagents & delegation

- **Pass `model: "opus"` on every `Agent` call** unless the task is small, cheap, and hard to get wrong. Weaker models
  silently ship lower-quality work; set the param explicitly.
- **Reference paths through env vars, not hand-typed strings.** Prefer `"$REPO_ROOT/path"` (set in the devshell) in
  shell commands and subagent briefs.
- **Every section of this file binds a subagent exactly as it binds the dispatcher.** A brief carries the task; point at
  this file for the rules instead of paraphrasing them.
- **Waiting is one background command, not a loop of turns.** Run a single `run_in_background` invocation whose body
  *is* the wait - e.g. `until [ -f /abs/path ] || [ "$SECONDS" -ge 900 ]; do sleep 15; done` - and let its completion
  notify you. Re-invoking cheap commands turn after turn to "check again" burns context.
- **The final check runs in the foreground; a pending check is an unfinished task.** Backgrounding is for long work in
  the middle of a task, never for the last thing before reporting. Report what you ran and what it said.
- **Message file first, commit second, never in one invocation.** Write the commit-message file (task-unique filename
  prefix - the scratchpad is shared), verify it exists, then run the commit that reads it as its own invocation. No
  shell invocation mixes a git command with a path outside this repository.
- **The live display belongs to a human.** Browser automation for screenshots and visual checks runs headless or on a
  private display the test owns, never by driving the session's `$DISPLAY` / `$WAYLAND_DISPLAY`.

## Concurrent agents & git

- **Worktree agents commit to the branch they were given and do not push.** The dispatcher - the session that reviews a
  branch by diff - lands it on `main` and pushes. Never `git checkout` a branch by hardcoded name in a script or brief.
- **Multiple agents may work this tree at once.** Before any state-changing git operation on a shared checkout, re-check
  `git status` *now*; session-start snapshots go stale.
- **Commit messages carry the reasoning.** The git log is a primary record: future agents reconstruct decisions from it,
  so a message is written for them in full sentences. Atomic commits, one change each.
- **Never kill by pattern; never poll by re-invocation.** Kill stray processes (a leftover `zola serve`) by specific
  PID.

## Building & verification

- **`audit` is the gate, and the pre-commit hook runs its hook tier.** One script (`nix/scripts/audit.nix`;
  `nix run .#audit`, and `audit` on the devshell's PATH) is the hook and "check your work" alike. `audit --hook` runs
  every stage that reads only this tree - the five formatters in check mode, biome's linter, `bun test`, deadnix,
  statix, shellcheck, `ascii`, the site build, and the internal link check - in about a second. Plain `audit` adds
  `links-external`, which fetches every outbound link; run it before publishing, and never make a commit wait on it.
- **`--no-verify` is not used.** The hook tier is sized so that nothing needs a hatch; a commit that cannot pass it is
  not finished. The devshell arms the hook by setting `core.hooksPath` to `.githooks/` on entry.
- **The `audit` on PATH is a build of the script, and goes stale the moment you edit it.** After changing
  `nix/scripts/audit.nix` or `nix/filesets.nix`, gate with `nix run .#audit`, which rebuilds; the PATH copy keeps
  running the previous stages and reads exactly like a change that did not apply. The first line of every run stamps the
  build's store path, tier, and stage count, so a stale copy is visible on line one. (The hook is immune: it re-resolves
  the flake through `nix develop` on every commit.)
- **The gate renders only the content that exists.** A template path no page reaches - a taxonomy page, a paginated
  section - is not checked by `site` until content reaches it, so exercise a new template with a scratch page before
  trusting a green gate.
- **Verify the site by building it and looking at it.** The point of this project is how it reads, so visual checking is
  legitimate here, not a smell. `zola --root site serve` is the live-preview loop.
- **Look at it for real.** A display and a browser are available: build, open the page, take screenshots, and compare
  before and after a change to templates or styles - at desktop and phone widths, in light and dark if the site supports
  both. Add a browser-automation tool to the devshell when a repeatable smoke test earns it, not before.
- **Test what has logic.** A static site has little; if a Tera component, an interactive example, or a build script
  grows real decision logic, give it a check that runs headless (`bun test` for JS/TS) rather than eyeballing it.

## Project setup & tooling

- **This project is a Nix flake** with `.envrc` (`use flake;`) so direnv auto-loads the devshell. The devshell is the
  single source of truth for tooling - add tools there, not ad-hoc global installs. The flake stays thin; everything
  substantive lives under `nix/` (`per-system.nix`, `devshell.nix`, `scripts/`, and more as pieces appear - a site
  package, a deployment module, a check - each added with its first consumer, not up front). (The Nix in use is Lix;
  every `nix ...` command works unchanged.)
- **Flakes see only what git tracks.** A new file under `nix/` is invisible to `nix develop` / `nix run` until it is at
  least `git add`ed - an "attribute missing" or "file not found" error about a file that plainly exists is almost always
  this.
- **Run tooling through the devshell.** In the main checkout, `direnv exec . <cmd>` is fast (it reads the cached
  layout); in a fresh git worktree, whose `.envrc` has never been allowed, use `nix develop -c <cmd>`. For a one-off
  tool: `nix shell nixpkgs#<pkg> -c <cmd>`.
- **Pin dependencies; updates are explicit and opt-in.** Zola and every other tool come from the `flake.lock` nixpkgs
  pin, so the site builds identically everywhere; bumping it is `nix flake update nixpkgs`, deliberate like any other
  pin, and a Zola version change in that bump is read for template or Sass breakage before it lands. Commit the
  lockfiles (`flake.lock`, and `bun.lock` once an example has dependencies) and pin full `major.minor.patch` versions.
  Themes, fonts, and scripts are vendored or pinned, never pulled from a CDN at `latest`.
- **Add dependencies incrementally, only when a need is real.** No theme, plugin, JavaScript, or web font speculatively.
- **Auto-format before every commit; don't hand-format.** `fmt` (in the devshell, or `nix run .#fmt`) runs the pinned
  formatters over every tracked file: `nixfmt`, `mdformat` (120 columns), `biome` for JS/TS/JSON/CSS, `prettier` for
  SCSS, and `djlint` for Tera templates. Five, because biome cannot parse SCSS or Tera; `nix/scripts/fmt.nix` has the
  reasoning. All five are on the devshell's PATH for editors too. Their settings live in `.editorconfig`, `biome.json`,
  `.djlintrc`, and `nix/mdformat.nix`; which files each owns is `nix/filesets.nix`, shared with the audit.
- **Keep `.editorconfig` and `.gitignore` current** as the stack grows.
- **Deployment is GitHub Pages, from CI** (`.github/workflows/pages.yml`). Every push and pull request runs
  `audit --hook` and builds `nix build .#site` (`nix/site.nix`) - the published site, without drafts, as a derivation -
  and a push to `main` deploys that build. The full audit, outbound links included, runs weekly and on demand, never in
  a push's path. Actions are pinned to commit SHAs with the release in a comment; bumping one is a deliberate edit.

## Source hygiene

- **Source files are ASCII, with no exceptions** (`.nix`, `.toml`, `.json`, `.scss`, `.css`, `.html`, `.sh`,
  `.js`/`.ts`; the exact list is `nix/filesets.nix`): `-` not an em-dash, `...` not an ellipsis, `->` not an arrow.
  Markdown content and prose are exempt.

  **The rendered HTML is ASCII too, by the author's preference** - straight quotes and apostrophes, hyphens for dashes,
  in templates and in `zola.toml`'s strings alike. Don't reach for an entity (`&rsquo;`, `&mdash;`) or an escape
  (`\u2019`) to put typography back into the page, and leave `smart_punctuation` off. An escape is for the rare
  character with no ASCII spelling that is genuinely wanted - a name's accent, a symbol - written as an HTML entity in a
  template, `\00e9` in CSS, `\u00e9` in JS/TS/TOML, `$'\u00e9'` in shell, so the file stays checkable by one grep.

  Two checks enforce the source rule and refuse the same bytes: the audit's `ascii` stage, and an edit-time hook
  (`.claude/scripts/strip-non-ascii.sh`, wired in `.claude/settings.json`) that rewrites dashes, ellipses, and arrows to
  ASCII and reports anything else. Don't fight either.

- **The site is en-US.** Code, comments, engineering notes, and site copy are written in English with en-US spelling,
  and `default_language` is `en-US`.

## Environment & harness

- **You have a `$DISPLAY`** and can run a real browser, so screenshots and visual checks can actually execute. Don't
  stub them out on the assumption of a headless sandbox.
- **Long-running / detached processes** (`zola serve` above all): start them with `run_in_background`, note the PID, and
  kill that PID when done. Foreground `sleep` is blocked; only sleep inside a background until-loop. Never
  `pkill -f <pattern>` where the pattern also matches the running command's own text.

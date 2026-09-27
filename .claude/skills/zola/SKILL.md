---
name: zola
description: How to write this site's Zola 0.23 / Tera 2 templates, components and content correctly. Load before creating or editing anything under site/ (templates, content, sass, zola.toml), before porting a snippet, theme or answer from the web, and when a zola build fails with a Tera error. Recall and most examples online are Zola <=0.22 / Tera 1 and are wrong here.
---

# Zola 0.23 and Tera 2 on this site

This site pins Zola **0.23.x** through `flake.lock`. Zola 0.23.0 is, in its own changelog's words, "probably the most
breaking version of Zola that will happen", and it breaks exactly the things memory and search results are full of.
Treat any template syntax you did not read at the pinned version as unverified.

## What changed, and what that means when writing

- **Tera 2, not Tera 1.** Zola \<=0.22 embeds Tera 1.x; 0.23 embeds Tera 2.x. Built-in filters, tests and their
  arguments changed; check each against the fixtures below. An undefined variable is an error, so a base template shared
  by pages *and* sections must guard page-only data: `{% if page is defined and page.extra.toc %}` (the `and`
  short-circuits).

- **Shortcodes are gone.** No `templates/shortcodes/`, no `{{ name(arg=1) }}` and no `{% name() %}...{% end %}` in
  content: the old block form fails the build with `Unknown tag`. Their replacement is **Tera components**, defined in
  any template file (this site: `site/templates/components.html`) and used the same way in templates and content, with
  no import:

  ```jinja2
  {% component youtube(id, autoplay=false) %}
  <iframe src="https://www.youtube.com/embed/{{ id }}{% if autoplay %}?autoplay=1{% endif %}"></iframe>
  {% endcomponent youtube %}

  {% component note(kind) %}<aside class="note {{ kind }}">{{ body }}</aside>{% endcomponent note %}
  ```

  ```md
  Inline: {{ <youtube id="dQw4w9WgXcQ" autoplay={true} /> }}

  {% <note kind="warn"> %}

  Block body, rendered as **Markdown** because of the blank lines around it.

  {% </note> %}
  ```

  Components are hygienic: they see only the arguments passed to them. `page`, `config`, `lang` and the rest are not in
  scope unless declared as implicit parameters, e.g. `{% component something(@config) %}`.

- **Every page and section is a Tera template.** A literal `{{` or `{%` in a post - a code sample about templates, say -
  must be wrapped in `{% raw %}...{% endraw %}`, or the file listed in `skip_content_templating` in `site/zola.toml`.

- **Syntax highlighting is Giallo, not syntect** (since 0.22): configuration lives under `[markdown.highlighting]`,
  theme names are TextMate ones, and some language names changed. `error_on_missing_language = true` makes a misspelled
  fence language a build error instead of silently unhighlighted code.

## This site's conventions

- **Front matter is YAML (`---`), not TOML (`+++`).** Zola accepts both; the Markdown formatter's front-matter plugin
  understands only YAML and destroys a TOML block (it reflows it into one paragraph). `nix/mdformat.nix` has the full
  reasoning.
- **Every post needs a `date`.** `blog/` sorts by date, and Zola drops an undated page from a date-sorted section with
  nothing but a warning. The audit's `site` stage treats any Zola warning as a failure for this reason.
- **A component call in Markdown must be valid HTML, or `fmt` breaks it.** mdformat keeps
  `{{ <figure src="a.png" alt="..." /> }}` verbatim as inline HTML, but an attribute that is not valid HTML - a list, a
  map, anything unquoted with spaces, like `items={[{"src": ...}]}` - makes it treat the call as text and escape it
  (`\<`, `\[`), which then fails the build. So attributes stay quoted strings or space-free `{expr}`, and structured
  data goes in the page's front matter under `extra`, looked up by name: the `gallery` component reads
  `extra.galleries.<name>`.
- **Block components keep a blank line after the opening tag and before the closing one.** Without them the formatter
  folds the whole thing onto one line, and Zola treats an unpadded body as an HTML block and does not render its
  Markdown anyway.
- **Formatting is `fmt`** (djlint for templates, prettier for SCSS, mdformat for Markdown, biome for JS/JSON/CSS).
  djlint handles Tera 2's component tags; biome's HTML formatter does not and is disabled in `biome.json`.
- **The site is in `site/`, run from the repository root:** `zola --root site build | check | serve`. The config file is
  `site/zola.toml` - 0.23's name for it; `config.toml` is only a fallback.
- **Typography in templates is plain ASCII**, in the source and on the page: straight quotes, hyphens, `...`. Not
  entities - the rendered HTML is ASCII by the author's preference (CLAUDE.md, "Source hygiene"). The edit-time hook
  rewrites the common typographic characters to ASCII for you.

## Looking things up at the pinned version

The pinned sources are the reference. Resolve them through the flake's own lock (`--inputs-from .`), never `nixpkgs#...`
bare, which would be whatever the registry points at today:

```sh
# Zola: CHANGELOG.md (read the 0.23.0 migration section), the full docs as
# Markdown under docs/content/documentation/, and the docs site's own Tera 2
# templates under docs/templates/ as working examples.
zsrc=$(nix build --no-link --print-out-paths --inputs-from . nixpkgs#zola.src)

# Tera, exactly as embedded: its version, then its rendering fixtures - one
# small file per feature under src/snapshot_tests/rendering_inputs/success/
# (components/, inheritance/, tests.txt, filters.txt, ...). Each file is the
# template input; its expected output is the matching `*@<file>.snap` under
# src/snapshot_tests/snapshots/, and errors/ holds what must be refused.
vendor=$(nix build --no-link --print-out-paths --inputs-from . nixpkgs#zola.cargoDeps)
ls -d "$vendor"/*/tera-*

# Filters and functions Zola adds on top of core Tera - `date`, `striptags`,
# `urlencode`, `json_encode`, ... from the `tera-contrib` crate beside it,
# plus Zola's own `get_url`, `get_section`, `resize_image` and the rest - are
# registered in one place:
grep -n 'register_' "$zsrc"/components/templates/src/lib.rs
```

Tera's prose documentation is not in the crate. Online, it is the Tera site and `MIGRATION.md` in the Tera repository.
Both track Tera's main branch, which can be ahead of the version Zola embeds, so check anything read there against the
fixtures above or a real `zola build`.

## Verifying

`zola --root site build` is the arbiter: a template error names the file, line and column. `audit --hook` runs it along
with the internal link check and the formatters. Two limits on what a green build proves:

- **It renders only what content reaches.** A template no page uses yet - `page.html` before the first post, a taxonomy
  or paginated listing - is parsed but never rendered, so an undefined variable in it cannot fail. Exercise a new
  template against a scratch copy (`cp -r site "$scratch"`, add a page, `zola --root "$scratch" build`) rather than
  adding throwaway content to the tree.
- **A template that renders can still render wrongly**, and most template mistakes are visual. Look at the page.

# Research Notes

Ongoing research toward building a Prettier plugin for Django templates + Django Cotton components.

## Landscape (as of March 2026)

### Existing Prettier Plugins for Django/Jinja

| Plugin | npm | Status | Cotton support |
|---|---|---|---|
| [prettier-plugin-jinja-template](https://github.com/davidodenwald/prettier-plugin-jinja-template) | ~12k/week | Active, v2.1.0. **Only one on Prettier's official plugin list.** | No |
| [prettier-plugin-django](https://github.com/junstyle/prettier-plugin-django) (junstyle) | ~100/week | Abandoned. Last commit Feb 2021. Forked from twig-melody. | No |
| [prettier-plugin-django](https://github.com/scorchio/prettier-plugin-django) (scorchio) | — | Fork of junstyle. Minimal activity. | No |
| [prettier-plugin-djangohtml](https://github.com/robertquitt/prettier-plugin-djangohtml) | — | WIP, not usable. | No |

None handle Cotton's dot-notation tag names.

### Prettier Core Position

Prettier maintainers have declined to add Django/Jinja support to core ([#5581](https://github.com/prettier/prettier/issues/5581), [#5754](https://github.com/prettier/prettier/issues/5754)). Community plugins are the only path.

### djlint

[djlint](https://github.com/djlint/djLint) is the standard Django template linter/formatter. Pure Python, understands Django syntax natively. Its **linter** is solid. Its **formatter** has known, unfixed bugs with template tags inside HTML attributes ([#195](https://github.com/Riverside-Healthcare/djLint/issues/195), [#353](https://github.com/Riverside-Healthcare/djLint/issues/353), [#444](https://github.com/Riverside-Healthcare/djLint/issues/444), [Django Forum thread](https://forum.djangoproject.com/t/issue-with-linters-reformatting-single-line-block-tags-in-django-templates/40671)).

The `{# djlint:off #}` pragma only suppresses lint checks — the formatter ignores it. There is no formatter escape hatch.

**Recommendation:** Use djlint for linting only (`djlint-django` pre-commit hook, not `djlint-reformat-django`).

## Plugin Architecture

### Prettier Plugin API

Three-stage pipeline:

1. **Parser** — `(text, options) => AST` with `locStart`/`locEnd` for source mapping
2. **Printer** — `print(path, options, print) => Doc` using Prettier's IR combinators (`group()`, `indent()`, `line`, `hardline`, `softline`, `join()`)
3. **Doc → String** — Prettier's Wadler-inspired line-breaking algorithm (plugin authors don't touch this)

Key extension point: `embed(path, options)` on the printer — delegates embedded languages (e.g., `<script>` blocks) to other parsers via `textToDoc`.

### Two Strategies for Mixed HTML + Template Syntax

**Strategy A: Placeholder Substitution** (faster to build, 80% quality)

1. Pre-process: replace `{% %}` / `{{ }}` with synthetic HTML placeholders
2. Feed valid HTML to Prettier's HTML parser (`angular-html-parser`)
3. Post-process: swap placeholders back to template expressions

Reuses Prettier's proven HTML formatting. Template tags treated as opaque blobs. This is what `prettier-plugin-jinja-template` does.

**Strategy B: Full Custom Parser** (slower to build, higher quality)

1. Write a parser that produces a combined AST (HTML nodes + template nodes like `IfStatement`, `ForBlock`, `Variable`)
2. Write a printer with a case for every node type
3. Use `embed` for `<script>`/`<style>` blocks

This is the twig-melody approach. Understands template block structure for better indentation.

### Effort Estimates

| Approach | Timeline | Coverage |
|---|---|---|
| Placeholder substitution | 2–4 weeks | 80% of real-world templates |
| Full custom parser | 1–3 months | Higher quality, block-aware indentation |

Either way: Cotton's dot-notation tag names need custom handling. The HTML5 spec allows dots in custom element names (`PCENChar` includes U+002E), but `angular-html-parser` doesn't.

### Reference Plugins

Worth studying for architecture patterns:

- **[prettier-plugin-jinja-template](https://github.com/davidodenwald/prettier-plugin-jinja-template)** — closest to our needs, placeholder strategy
- **[prettier-plugin-twig-melody](https://github.com/trivago/prettier-plugin-twig-melody)** — full custom parser, most battle-tested template-language plugin
- **[prettier-plugin-svelte](https://github.com/sveltejs/prettier-plugin-svelte)** — official, mature, good `embed` patterns for mixed languages
- **[prettier-plugin-astro](https://github.com/withastro/prettier-plugin-astro)** — handles frontmatter + HTML + expressions
- **[prettier-plugin-go-template](https://github.com/NiklasPor/prettier-plugin-go-template)** — handles `{{ }}` delimiters as distinct tokens

### Prettier's Internal HTML Parser

Prettier uses `angular-html-parser` (extracted from Angular's compiler). It's available as an npm package but is **not a stable public API** for plugin authors. Options:

- Use it directly as a dependency and write a custom printer
- Use placeholder strategy to feed it valid HTML
- Delegate via `textToDoc` inside `embed` for subsections

## Django Cotton Specifics

### Tag Name Syntax

Cotton components use dot notation: `<c-atoms.button>`, `<c-organisms.header>`. The `c-` prefix satisfies the HTML5 custom element hyphen requirement. Dots are valid per the spec (`PCENChar` includes `.`), but most parsers don't expect them.

**For the plugin:** The tokenizer/parser must recognize `c-[word].[word]` (and deeper nesting like `c-atoms.nav-link`) as valid tag names.

### Cotton-Specific Syntax

- `<c-vars />` — declares component props with defaults
- `<c-slot />` — named slots
- `:prop="value"` — passes Django template expressions (similar to Vue's `v-bind`)
- `{{ slot }}` — default slot content
- `{{ attrs }}` — spreads remaining attributes

### Self-Closing Convention

Cotton components with no children self-close with `/>`:
```html
<c-atoms.icon name="check" class="w-4 h-4" />
<c-organisms.header />
```

Non-void HTML elements never self-close (per HTML spec).

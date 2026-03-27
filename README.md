# prettier-plugin-django-cotton

A [Prettier](https://prettier.io) plugin for formatting Django templates and [Django Cotton](https://django-cotton.com) components. Produces clean, human-readable HTML with consistent formatting for template tags, expressions, and Cotton's dot-notation component syntax.

## Why

Existing tools fall short for Django + Cotton templates:

- **djlint** has a solid linter but its formatter [mangles template tags inside HTML attributes](https://github.com/Riverside-Healthcare/djLint/issues/195) — injecting whitespace into rendered output. There is no escape hatch.
- **prettier-plugin-jinja-template** handles Jinja2 but doesn't support Cotton's dot-notation tag names (`<c-atoms.button>`).
- **Prettier's built-in HTML parser** chokes on `{% %}` / `{{ }}` syntax and dots in custom element names.

This plugin bridges the gap by wrapping Prettier's HTML formatter with placeholder substitution — Django/Cotton syntax is protected during formatting and restored afterward. You get Prettier's battle-tested HTML formatting with full Django and Cotton support.

## Install

```bash
npm install --save-dev prettier prettier-plugin-django-cotton
```

## Usage

```bash
# Format a file
npx prettier --plugin prettier-plugin-django-cotton --parser django-html --write template.html

# Check without writing
npx prettier --plugin prettier-plugin-django-cotton --parser django-html --check "templates/**/*.html"
```

Or add to `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-django-cotton"],
  "overrides": [
    {
      "files": "*.html",
      "options": {
        "parser": "django-html"
      }
    }
  ]
}
```

## What it handles

| Syntax | Example | How |
|---|---|---|
| Expressions | `{{ user.name }}`, `{{ val\|default:'' }}` | Preserved verbatim |
| Template tags | `{% load %}`, `{% url %}`, `{% trans %}`, `{% static %}` | Preserved verbatim |
| Block tags | `{% if %}...{% endif %}`, `{% for %}...{% endfor %}` | Block-matched, content formatted |
| Mid-block tags | `{% else %}`, `{% elif %}`, `{% empty %}` | Handled within blocks |
| Comments | `{# comment #}` | Preserved verbatim |
| Cotton components | `<c-atoms.button>`, `<c-molecules.form-field />` | Dot-notation escaped/restored |
| Tags in attributes | `class="{% if x %}active{% endif %}"` | Kept on one line |
| Standard HTML | Everything else | Formatted by Prettier's HTML formatter |

## How it works

Placeholder substitution strategy, inspired by [prettier-plugin-jinja-template](https://github.com/davidodenwald/prettier-plugin-jinja-template):

1. **Extract** template constructs (`{% %}`, `{{ }}`, `{# #}`) and replace with unique placeholders
2. **Escape** Cotton dot-notation (`c-atoms.button` -> `c-atoms--dot--button`) so the HTML parser accepts it
3. **Delegate** to Prettier's HTML parser/printer via `textToDoc`
4. **Restore** placeholders and dot-notation in the formatted Doc IR via `mapDoc`

This means all of Prettier's HTML formatting options work as expected (`printWidth`, `tabWidth`, `bracketSameLine`, etc.).

## Status

**Beta** — actively developed and tested against real-world Django + Cotton projects.

Known limitations:
- Extra blank lines may be inserted between elements (Prettier's HTML formatter behavior)
- Block-level template tag indentation uses a fallback path (correct output, not yet optimized)

## License

[MIT](LICENSE)

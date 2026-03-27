# Formatting Conventions

Prettier-inspired formatting rules for Django templates with Django Cotton components. These conventions serve as the **specification** for what the plugin should produce — every rule here should eventually be automated.

Currently enforced manually (no auto-formatter exists for Django + Cotton). djlint runs lint-only in the litigant-portal project.

## Why Not djlint's Formatter?

djlint's formatter mangles template tags inside HTML attributes — it expands single-line `{% block %}` tags to multi-line, injecting literal whitespace into rendered attribute values. There is no escape hatch (`{# djlint:off #}` only suppresses lint rules, not the formatter). This is a [known class of bugs](https://github.com/Riverside-Healthcare/djLint/issues/195) with no fix planned.

## Why Not Existing Prettier Plugins?

[`prettier-plugin-jinja-template`](https://github.com/davidodenwald/prettier-plugin-jinja-template) (~12k weekly downloads) is the most viable option for plain Django/Jinja2 templates. However, none of the existing plugins handle Django Cotton's dot-notation tag names (`<c-atoms.button>`). While dots are valid in the [HTML5 custom element spec](https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name) (they're in the `PCENChar` production), Prettier's `angular-html-parser` doesn't handle them — it chokes or mangles the output.

## Conventions

### 1. Indentation

2 spaces. HTML elements, Cotton components, and Django template tags all indent the same way.

### 2. Attribute Wrapping

**Single line** when all attributes fit within ~120 characters:

```html
<div class="flex items-center gap-2">
<c-atoms.icon name="check" class="w-4 h-4" />
<c-atoms.button type="button" variant="primary" x-on:click="save">
```

**Multi-line** when they don't fit. One attribute per line, indented 2 spaces from the tag. Closing `>` or `/>` goes on its own line (Prettier default, `bracketSameLine: false`):

```html
<input
  type="text"
  x-bind:value="inputText"
  x-on:input="updateInput"
  name="q"
  placeholder="{% trans 'Ask a question' %}"
  class="chat-input"
  aria-label="{% trans 'Ask a question' %}"
/>
```

Cotton components follow the same rule:

```html
<c-molecules.form-field
  label="Email"
  type="email"
  name="email"
  required
  value="{{ form.email.value|default:'' }}"
/>
```

### 3. Template Tags Inside Attributes (Critical Rule)

Django template tags (`{% block %}`, `{% if %}`, `{{ var }}`) inside an attribute value **must stay on the same line** as the attribute. Line breaks inside attribute values become literal whitespace in the rendered HTML.

```html
<!-- GOOD -->
<body class="{% block body_class %}min-h-dvh flex flex-col bg-greyscale-25{% endblock body_class %}">
<main class="flex-1 {% block main_class %}{% endblock main_class %}">
<meta name="description" content="{% block meta_description %}{% trans 'Default' %}{% endblock meta_description %}">

<!-- BAD: whitespace injected into rendered class attribute -->
<body class="{% block body_class %}
    min-h-dvh flex flex-col bg-greyscale-25{% endblock body_class %}
    ">
```

These lines will be long. That's intentional — attribute values are not breakable.

**Adjacent template tag blocks must be separated by a space.** When two `{% if %}...{% endif %}` blocks (or any closing `{% end* %}` followed by an opening `{% %}`) sit next to each other inside an attribute, the rendered output concatenates their values with no separator. Always put a literal space between them:

```html
<!-- GOOD: space between {% endif %} and {% if %} -->
class="{% if full_width %}w-full{% else %}w-fit{% endif %} {% if variant == 'outline' %}border{% else %}shadow{% endif %}"

<!-- BAD: missing space produces "w-fitborder" or "w-fullshadow" -->
class="{% if full_width %}w-full{% else %}w-fit{% endif %}{% if variant == 'outline' %}border{% else %}shadow{% endif %}"
```

This applies to any adjacent template blocks inside attribute values — `{% if %}...{% endif %}{% if %}`, `{% if %}...{% endif %}{{ var }}`, `{{ var }}{% if %}`, etc. The formatter should ensure at least one whitespace character exists between any closing template tag and the next opening template tag or variable within an attribute value.

### 4. Block-Level Template Tags

Outside of attributes, `{% block %}`, `{% if %}`, `{% for %}` etc. get their own lines and indent their children:

```html
{% block content %}
  <div class="container">
    <h1>Title</h1>
  </div>
{% endblock content %}

{% if user.is_authenticated %}
  <p>Welcome</p>
{% else %}
  <p>Please sign in</p>
{% endif %}
```

### 5. Self-Closing Tags

Prettier adds `/>` to void HTML elements and self-closing components alike. Follow Prettier:

```html
<!-- Void HTML elements -->
<meta charset="UTF-8" />
<input type="text" name="q" />
<img src="logo.svg" alt="Logo" class="h-12" />

<!-- Cotton self-closing -->
<c-atoms.icon name="check" class="w-4 h-4" />
<c-atoms.typing-indicator />
<c-organisms.header />
```

### 6. Quotes

Double quotes for all HTML attributes. Single quotes only inside attribute values for nested Django template tags:

```html
value="{{ form.email.value|default:'' }}"
```

**`{% trans %}` in Cotton props:** Never put `{% trans %}` directly in a prop attribute — the single quotes needed to avoid closing the HTML attribute violate djlint T002. Extract to a variable first:

```html
{% trans "Check your email" as status_heading %}
<c-molecules.auth-status
  heading="{{ status_heading }}"
></c-molecules.auth-status>
```

### 7. Blank Lines

One blank line between logical sections. Never multiple consecutive blank lines. No blank line immediately after an opening tag or before a closing tag:

```html
<!-- GOOD -->
<div class="container">
  <h1>Title</h1>
  <p>Content</p>
</div>

<!-- BAD -->
<div class="container">

  <h1>Title</h1>
</div>
```

### 8. Inline Elements

Short inline elements with text content stay on one line when they fit:

```html
<p class="text-sm text-greyscale-500">{% trans "No activity yet" %}</p>
<span class="font-semibold">{% trans "Activity" %}</span>
```

### 9. Long Class Values

Tailwind class strings stay on one line even when long — don't break a `class` value across lines. If the element has many attributes, `class` gets its own line in the multi-line format (rule 2), but the value itself stays unbroken.

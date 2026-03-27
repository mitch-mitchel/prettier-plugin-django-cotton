import { describe, test, expect } from 'vitest'
import * as prettier from 'prettier'
import { escapeCottonDots, restoreCottonDots } from '../src/parser.js'
import * as plugin from '../src/index.js'

const format = (code, options = {}) =>
  prettier.format(code, {
    parser: 'django-html',
    plugins: [plugin],
    printWidth: 120,
    ...options,
  })

// --- Unit: Cotton dot helpers ---

describe('escapeCottonDots', () => {
  test('replaces dots in opening tags', () => {
    expect(escapeCottonDots('<c-atoms.button>')).toBe('<c-atoms--dot--button>')
  })

  test('replaces dots in closing tags', () => {
    expect(escapeCottonDots('</c-atoms.button>')).toBe('</c-atoms--dot--button>')
  })

  test('handles multiple dot segments', () => {
    expect(escapeCottonDots('<c-atoms.nav-link>')).toBe('<c-atoms--dot--nav-link>')
  })

  test('leaves non-Cotton tags alone', () => {
    expect(escapeCottonDots('<div class="foo">')).toBe('<div class="foo">')
  })

  test('handles self-closing', () => {
    expect(escapeCottonDots('<c-atoms.icon name="check" />')).toBe(
      '<c-atoms--dot--icon name="check" />',
    )
  })
})

describe('restoreCottonDots', () => {
  test('restores dots', () => {
    expect(restoreCottonDots('c-atoms--dot--button')).toBe('c-atoms.button')
  })

  test('no-op when no markers', () => {
    expect(restoreCottonDots('div')).toBe('div')
  })
})

// --- Integration: full format ---

describe('format', () => {
  test('preserves simple template expression', async () => {
    const input = '<div>{{ user.name }}</div>\n'
    const output = await format(input)
    expect(output).toContain('{{ user.name }}')
  })

  test('preserves template tag in attribute', async () => {
    const input = '<div class="{{ css_class }}">\n  <p>hello</p>\n</div>\n'
    const output = await format(input)
    expect(output).toContain('class="{{ css_class }}"')
  })

  test('formats Cotton component tag names', async () => {
    const input = '<c-atoms.button type="button">Click</c-atoms.button>\n'
    const output = await format(input)
    expect(output).toContain('c-atoms.button')
    expect(output).not.toContain('--dot--')
  })

  test('formats self-closing Cotton component', async () => {
    const input = '<c-atoms.icon name="check" class="w-4 h-4" />\n'
    const output = await format(input)
    expect(output).toContain('c-atoms.icon')
    expect(output).not.toContain('--dot--')
  })

  test('handles {% load %} tags', async () => {
    const input = '{% load i18n %}\n{% load cotton_tags %}\n\n<div>hello</div>\n'
    const output = await format(input)
    expect(output).toContain('{% load i18n %}')
    expect(output).toContain('{% load cotton_tags %}')
  })

  test('handles if/else/endif block', async () => {
    const input =
      '{% if show %}\n  <p>visible</p>\n{% else %}\n  <p>hidden</p>\n{% endif %}\n'
    const output = await format(input)
    expect(output).toContain('{% if show %}')
    expect(output).toContain('{% else %}')
    expect(output).toContain('{% endif %}')
    expect(output).toContain('<p>visible</p>')
    expect(output).toContain('<p>hidden</p>')
  })

  test('handles for loop block', async () => {
    const input =
      '{% for item in items %}\n  <li>{{ item.name }}</li>\n{% endfor %}\n'
    const output = await format(input)
    expect(output).toContain('{% for item in items %}')
    expect(output).toContain('{{ item.name }}')
    expect(output).toContain('{% endfor %}')
  })

  test('handles nested Cotton with template tags', async () => {
    const input = `<c-atoms.button
  type="button"
  variant="primary"
  class="{% if active %}ring-2{% endif %}"
>
  {% trans "Save" %}
</c-atoms.button>
`
    const output = await format(input)
    expect(output).toContain('c-atoms.button')
    expect(output).toContain('{% if active %}ring-2{% endif %}')
    expect(output).toContain('{% trans "Save" %}')
    expect(output).not.toContain('--dot--')
  })

  test('handles template expressions in attributes', async () => {
    const input =
      '<input type="text" value="{{ form.email.value|default:\'\' }}" />\n'
    const output = await format(input)
    expect(output).toContain("{{ form.email.value|default:'' }}")
  })

  test('handles {% url %} in href', async () => {
    const input = '<a href="{% url \'login\' %}">Sign in</a>\n'
    const output = await format(input)
    expect(output).toContain("{% url 'login' %}")
  })

  test('preserves nested {% with %} blocks', async () => {
    const input = [
      '{% with a="1" %}',
      '{% with b="2" %}',
      '{% with c="3" %}',
      '<p>{{ a }} {{ b }} {{ c }}</p>',
      '{% endwith %}',
      '{% endwith %}',
      '{% endwith %}',
      '',
    ].join('\n')
    const output = await format(input)
    // Must have exactly 3 endwith tags — no content loss
    const endwiths = output.match(/\{% endwith %\}/g) || []
    expect(endwiths.length).toBe(3)
    expect(output).toContain('{% with a="1" %}')
    expect(output).toContain('{% with b="2" %}')
    expect(output).toContain('{% with c="3" %}')
  })

  test('preserves 5 nested {% with %} blocks', async () => {
    const input = [
      '{% with a="1" %}',
      '{% with b="2" %}',
      '{% with c="3" %}',
      '{% with d="4" %}',
      '{% with e="5" %}',
      '<p>inner</p>',
      '{% endwith %}',
      '{% endwith %}',
      '{% endwith %}',
      '{% endwith %}',
      '{% endwith %}',
      '',
    ].join('\n')
    const output = await format(input)
    const endwiths = output.match(/\{% endwith %\}/g) || []
    expect(endwiths.length).toBe(5)
  })

  test('preserves newlines between adjacent comments', async () => {
    const input = '{# comment one #}\n{# comment two #}\n<div>hi</div>\n'
    const output = await format(input)
    // Comments should not be merged onto the same line
    expect(output).not.toMatch(/\{# comment one #\}[^\n]*\{# comment two #\}/)
  })

  test('wraps long attributes multi-line', async () => {
    const input =
      '<c-molecules.form-field label="Email" type="email" name="email" required value="{{ form.email.value|default:\'\' }}" help_text="We will never share your email" />\n'
    const output = await format(input, { printWidth: 80 })
    // Should break into multiple lines at printWidth 80
    const lines = output.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(output).toContain('c-molecules.form-field')
    expect(output).not.toContain('--dot--')
  })
})

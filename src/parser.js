/**
 * Parser for Django templates with Cotton components.
 *
 * Strategy: placeholder substitution.
 * 1. Escape Cotton dot-notation tag names (c-atoms.button -> c-atoms--dot--button)
 * 2. Replace all template constructs ({%  %}, {{  }}, {#  #}) with unique placeholders
 * 3. Match block-level tags (if/endif, for/endfor, etc.) into block nodes
 * 4. Return a root AST node whose `content` is valid HTML with placeholders
 *
 * The printer delegates `content` to Prettier's HTML parser via textToDoc,
 * then walks the Doc IR to restore placeholders and dot-notation.
 */

const TEMPLATE_TAG_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g
const COTTON_DOT_TAG_RE = /<(\/?)(c-[\w]+)((?:\.[\w-]+)+)/g
const KEYWORD_RE = /\{%[-+]?\s*(\w+)/

const BLOCK_OPENERS = new Set([
  'if',
  'for',
  'block',
  'with',
  'spaceless',
  'autoescape',
  'blocktrans',
  'blocktranslate',
  'comment',
  'verbatim',
  'filter',
])

const PLACEHOLDER_OPEN = '#~'
const PLACEHOLDER_CLOSE = '~#'
const DOT_MARKER = '--dot--'

let nextId = 0

function makeId() {
  return `${PLACEHOLDER_OPEN}${nextId++}${PLACEHOLDER_CLOSE}`
}

// --- Cotton dot-notation helpers ---

export function escapeCottonDots(text) {
  return text.replace(COTTON_DOT_TAG_RE, (_, slash, prefix, dotParts) => {
    return `<${slash}${prefix}${dotParts.replaceAll('.', DOT_MARKER)}`
  })
}

export function restoreCottonDots(text) {
  if (!text.includes(DOT_MARKER)) return text
  return text.replace(
    new RegExp(`(c-[\\w]+)((?:${DOT_MARKER}[\\w-]+)+)`, 'g'),
    (_, prefix, parts) => {
      return prefix + parts.replaceAll(DOT_MARKER, '.')
    },
  )
}

// --- Keyword extraction ---

function extractKeyword(tag) {
  const m = tag.match(KEYWORD_RE)
  return m ? m[1] : ''
}

function isBlockCloser(keyword) {
  return keyword.startsWith('end') && keyword.length > 3
}

function openerKeywordFor(closerKeyword) {
  return closerKeyword.slice(3)
}

// --- Block matching ---

/**
 * Scan content for placeholder pairs that form blocks (opener + closer).
 * Processes innermost blocks first by restarting after each match.
 */
function matchBlocks(content, nodes) {
  const PLACEHOLDER_RE = new RegExp(
    `${escapeForRegex(PLACEHOLDER_OPEN)}(\\d+)${escapeForRegex(PLACEHOLDER_CLOSE)}`,
    'g',
  )

  let modified = true
  while (modified) {
    modified = false
    const stack = []
    PLACEHOLDER_RE.lastIndex = 0

    let m
    while ((m = PLACEHOLDER_RE.exec(content)) !== null) {
      const id = m[0]
      const node = nodes[id]
      if (!node || node.type !== 'statement') continue

      if (BLOCK_OPENERS.has(node.keyword)) {
        stack.push({ id, pos: m.index })
      } else if (isBlockCloser(node.keyword)) {
        const target = openerKeywordFor(node.keyword)

        // Search stack top-down for matching opener
        let found = -1
        for (let i = stack.length - 1; i >= 0; i--) {
          if (nodes[stack[i].id].keyword === target) {
            found = i
            break
          }
        }

        if (found >= 0) {
          const opener = stack.splice(found, 1)[0]

          const blockId = makeId()
          const blockStart = opener.pos
          const blockEnd = m.index + id.length
          const innerStart = opener.pos + opener.id.length
          const innerEnd = m.index
          const blockContent = content.slice(innerStart, innerEnd)

          nodes[blockId] = {
            type: 'block',
            id: blockId,
            start: nodes[opener.id],
            end: node,
            content: blockContent,
            nodes,
            index: nodes[opener.id].index,
            length: node.index + node.length - nodes[opener.id].index,
          }

          content = content.slice(0, blockStart) + blockId + content.slice(blockEnd)
          modified = true
          break // restart scan — positions shifted
        }
      }
    }
  }

  return content
}

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- Main parse function ---

export function parse(text) {
  nextId = 0
  const nodes = {}

  // Step 1: Escape Cotton dot-notation
  const escaped = escapeCottonDots(text)

  // Step 2: Replace template constructs with placeholders
  const matches = [...escaped.matchAll(TEMPLATE_TAG_RE)]

  let content = ''
  let lastEnd = 0

  for (const match of matches) {
    const raw = match[0]
    const pos = match.index

    content += escaped.slice(lastEnd, pos)

    const id = makeId()

    let type = 'comment'
    let keyword
    if (raw.startsWith('{{')) {
      type = 'expression'
    } else if (raw.startsWith('{%')) {
      type = 'statement'
      keyword = extractKeyword(raw)
    }

    // Count newlines between previous construct and this one
    const textBefore = escaped.slice(lastEnd, pos)
    const preNewLines = (textBefore.match(/\n/g) || []).length

    // A tag is "standalone" if it's the first non-whitespace on its line.
    // Standalone tags are safe to have hardlines before them; inline tags
    // (e.g., inside attribute values) are not.
    const lineStart = escaped.lastIndexOf('\n', pos - 1) + 1
    const leadingText = escaped.slice(lineStart, pos)
    const standalone = leadingText.trim() === ''

    nodes[id] = {
      type,
      id,
      keyword,
      originalText: raw,
      index: pos,
      length: raw.length,
      preNewLines,
      standalone,
    }

    content += id
    lastEnd = pos + raw.length
  }
  content += escaped.slice(lastEnd)

  // Step 3: Match block-level tags
  content = matchBlocks(content, nodes)

  return {
    type: 'root',
    content,
    nodes,
    index: 0,
    length: text.length,
  }
}

export function locStart(node) {
  return node.index ?? 0
}

export function locEnd(node) {
  return (node.index ?? 0) + (node.length ?? 0)
}

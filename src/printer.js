/**
 * Printer for Django/Cotton templates.
 *
 * Leaf nodes (expression, statement, comment) are printed as their original text.
 * Root and block nodes delegate to Prettier's HTML printer via `embed` + `textToDoc`,
 * then walk the resulting Doc IR to swap placeholders back to template syntax.
 */

import { doc } from 'prettier'
import { restoreCottonDots } from './parser.js'

const { builders, utils } = doc
const { group, indent, hardline, trim } = builders

const PLACEHOLDER_RE = /#~\d+~#/g
const DOT_MARKER_RE = /(c-[\w]+)((?:--dot--[\w-]+)+)/g

const MID_BLOCK_KEYWORDS = new Set(['else', 'elif', 'empty'])

// --- Printer API ---

export const printer = {
  print: printNode,
  embed,
  getVisitorKeys,
}

function printNode(path) {
  const node = path.getNode()

  switch (node.type) {
    case 'expression':
    case 'statement':
    case 'comment': {
      const doc = node.originalText
      // Restore line breaks that the HTML parser collapsed, but only for
      // standalone tags (not inside attribute values where hardlines break HTML)
      if (node.preNewLines > 0 && node.standalone) {
        return [trim, hardline, doc]
      }
      return doc
    }
    case 'block': {
      // Fallback when embed doesn't handle the block (e.g., inside attributes).
      // Reconstruct original text so content is never lost.
      const blockDoc = reconstructBlock(node)
      if (node.start.preNewLines > 0 && node.start.standalone) {
        return [trim, hardline, blockDoc]
      }
      return blockDoc
    }
    default:
      // root is handled by embed
      return ''
  }
}

/**
 * Reconstruct a block's original text by recursively resolving inner placeholders.
 * Used as a safe fallback when the async embed path doesn't fire.
 */
function reconstructBlock(node) {
  const content = node.content.replace(/#~\d+~#/g, (id) => {
    const inner = node.nodes[id]
    if (!inner) return id
    if (inner.type === 'block') return reconstructBlock(inner)
    return inner.originalText
  })
  // Block content has --dot-- markers from preprocessing; restore them
  return restoreCottonDots(node.start.originalText + content + node.end.originalText)
}

function embed(path) {
  const node = path.getNode()
  if (node.type !== 'root' && node.type !== 'block') return undefined

  return async (textToDoc, print, path, options) => {
    const node = path.getNode()

    if (node.type === 'root') {
      return formatContent(node.content, node.nodes, textToDoc, print, path, options)
    }

    if (node.type === 'block') {
      return formatBlock(node, textToDoc, print, path, options)
    }
  }
}

function getVisitorKeys(node) {
  switch (node.type) {
    case 'root':
      // Traverse all nodes so Prettier pre-resolves embeds for blocks
      return ['nodes']
    case 'block':
      // Don't include 'nodes' — it's the shared dict and would cause
      // circular traversal (every block re-visits the entire node map)
      return ['start', 'end']
    default:
      return []
  }
}

// --- Content formatting (delegates to HTML parser) ---

async function formatContent(content, nodes, textToDoc, print, path, options) {
  const htmlDoc = await textToDoc(content, { ...options, parser: 'html' })
  return mapPlaceholders(htmlDoc, nodes, print, path)
}

/**
 * Walk a Doc IR tree, replacing placeholder strings (#~N~#) with printed
 * template nodes and restoring Cotton dot-notation (--dot-- -> .).
 */
function mapPlaceholders(htmlDoc, nodes, print, path) {
  return utils.mapDoc(htmlDoc, (currentDoc) => {
    if (typeof currentDoc !== 'string') return currentDoc

    // Quick check: does this string contain anything we need to transform?
    const hasPlaceholders = PLACEHOLDER_RE.test(currentDoc)
    const hasDotMarkers = DOT_MARKER_RE.test(currentDoc)
    if (!hasPlaceholders && !hasDotMarkers) return currentDoc

    // Reset regex state
    PLACEHOLDER_RE.lastIndex = 0
    DOT_MARKER_RE.lastIndex = 0

    // Restore Cotton dots first (affects text around placeholders)
    let text = hasDotMarkers ? restoreCottonDots(currentDoc) : currentDoc

    if (!hasPlaceholders) return text

    // Split at placeholders and interleave with printed nodes
    const parts = []
    let lastEnd = 0
    let m

    PLACEHOLDER_RE.lastIndex = 0
    while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
      if (m.index > lastEnd) {
        parts.push(text.slice(lastEnd, m.index))
      }

      const nodeId = m[0]
      if (nodes[nodeId]) {
        parts.push(path.call(print, 'nodes', nodeId))
      } else {
        parts.push(nodeId)
      }
      lastEnd = m.index + m[0].length
    }

    if (lastEnd < text.length) {
      parts.push(text.slice(lastEnd))
    }

    return parts.length === 1 ? parts[0] : parts
  })
}

// --- Block formatting ---

async function formatBlock(node, textToDoc, print, path, options) {
  const startDoc = path.call(print, 'start')
  const endDoc = path.call(print, 'end')

  const content = node.content

  // Empty block
  if (!content.trim()) {
    return [startDoc, endDoc]
  }

  // Split content at else/elif/empty separators
  const parts = splitAtMiddle(content, node.nodes)

  const docParts = []
  for (const part of parts) {
    if (part.type === 'separator') {
      // Dedent, print separator, re-indent next section
      docParts.push(hardline, trim, path.call(print, 'nodes', part.id))
    } else if (part.content.trim()) {
      const htmlDoc = await textToDoc(part.content, { ...options, parser: 'html' })
      docParts.push(mapPlaceholders(htmlDoc, node.nodes, print, path))
    }
  }

  return group([startDoc, indent([hardline, ...docParts]), hardline, endDoc])
}

/**
 * Split block content at mid-block keywords (else, elif, empty).
 * Returns alternating content and separator entries.
 */
function splitAtMiddle(content, nodes) {
  const re = new RegExp(PLACEHOLDER_RE.source, 'g')
  const parts = []
  let lastEnd = 0
  let m

  while ((m = re.exec(content)) !== null) {
    const id = m[0]
    const node = nodes[id]
    if (node && node.type === 'statement' && MID_BLOCK_KEYWORDS.has(node.keyword)) {
      parts.push({ type: 'content', content: content.slice(lastEnd, m.index) })
      parts.push({ type: 'separator', id })
      lastEnd = m.index + id.length
    }
  }

  parts.push({ type: 'content', content: content.slice(lastEnd) })
  return parts
}

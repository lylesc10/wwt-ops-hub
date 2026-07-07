/**
 * Render document schema_data into a styled Word (DOCX) document.
 *
 * Ported from field-services backend/app/docgen/renderer/docx.py — full
 * markdown conversion: headings, bullet lists, numbered lists, styled tables
 * with shaded header/alternating rows, code blocks, inline formatting
 * (***bold italic***, **bold**, *italic*, `code`), checkboxes, and
 * "⚠️ CRITICAL" warning callouts.
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, PageBreak,
} from 'docx'

const CHECKBOX_UNCHECKED = '☐' // ☐
const CHECKBOX_CHECKED = '☑'   // ☑

const WARNING_PATTERN = /\*\*⚠️\s*CRITICAL:\*\*\s*/

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
]

function headingLevel(n) {
  return HEADING_LEVELS[Math.min(Math.max(n, 1), 6) - 1]
}

// ── Inline formatting ─────────────────────────────────────────────────────────

function inlineRuns(text, extra = {}) {
  const runs = []
  const pattern = /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|([^*`]+)/g
  let m
  while ((m = pattern.exec(text)) !== null) {
    if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], bold: true, italics: true, ...extra }))
    } else if (m[4] !== undefined) {
      runs.push(new TextRun({ text: m[4], bold: true, ...extra }))
    } else if (m[6] !== undefined) {
      runs.push(new TextRun({ text: m[6], italics: true, ...extra }))
    } else if (m[8] !== undefined) {
      runs.push(new TextRun({ text: m[8], font: 'Courier New', size: 18, ...extra }))
    } else if (m[9] !== undefined) {
      runs.push(new TextRun({ text: m[9], ...extra }))
    }
  }
  return runs.length ? runs : [new TextRun({ text, ...extra })]
}

// ── Block renderers ───────────────────────────────────────────────────────────

function renderCheckboxItem(text, checked) {
  return new Paragraph({
    spacing: { before: 0, after: 40 },
    children: [
      new TextRun({ text: `${checked ? CHECKBOX_CHECKED : CHECKBOX_UNCHECKED}  `, size: 24 }),
      ...inlineRuns(text),
    ],
  })
}

function renderWarning(text) {
  return new Paragraph({
    indent: { left: 360 },
    children: [
      new TextRun({ text: '⚠️ CRITICAL: ', bold: true, color: 'CC0000', size: 22 }),
      ...inlineRuns(text),
    ],
  })
}

function renderTable(tableLines) {
  const dataRows = []
  for (const line of tableLines) {
    if (!line.startsWith('|')) continue
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
    // Skip separator rows (all cells are dashes/colons/spaces)
    if (cells.every(c => /^[-: ]*$/.test(c))) continue
    dataRows.push(cells)
  }
  if (!dataRows.length) return [new Paragraph({ text: '[Empty table]' })]

  const numCols = Math.max(...dataRows.map(r => r.length))

  const rows = dataRows.map((cells, rowIdx) => new TableRow({
    children: Array.from({ length: numCols }, (_, colIdx) => {
      const cellText = cells[colIdx] ?? ''
      const isHeader = rowIdx === 0
      const shading = isHeader
        ? { type: ShadingType.CLEAR, fill: '2F5496' }
        : rowIdx % 2 === 0
          ? { type: ShadingType.CLEAR, fill: 'D9E2F3' }
          : undefined
      return new TableCell({
        shading,
        children: [new Paragraph({
          children: isHeader
            ? [new TextRun({ text: cellText, bold: true, color: 'FFFFFF' })]
            : inlineRuns(cellText),
        })],
      })
    }),
  }))

  return [
    new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    new Paragraph({ text: '' }),
  ]
}

/**
 * Parse markdown content and render as DOCX elements.
 */
function renderMarkdown(markdown, baseHeadingLevel = 2) {
  const elements = []
  // Strip ```markdown fences the AI sometimes wraps around content
  let text = markdown.trim()
    .replace(/^```(?:markdown|md)?\s*\n/, '')
    .replace(/\n```\s*$/, '')

  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const stripped = lines[i].trim()

    if (!stripped) { i++; continue }

    // Headings
    const hm = /^(#{1,6})\s+(.+)$/.exec(stripped)
    if (hm) {
      elements.push(new Paragraph({
        text: hm[2].trim(),
        heading: headingLevel(baseHeadingLevel + hm[1].length - 1),
      }))
      i++
      continue
    }

    // Markdown table
    if (stripped.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }
      elements.push(...renderTable(tableLines))
      continue
    }

    // Checkbox list
    if (/^[-*]\s+\[([ xX])\]\s+/.test(stripped)) {
      while (i < lines.length && /^\s*[-*]\s+\[([ xX])\]\s+/.test(lines[i])) {
        const cb = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i])
        if (cb) elements.push(renderCheckboxItem(cb[2].trim(), cb[1].toLowerCase() === 'x'))
        i++
      }
      continue
    }

    // Warning callout
    if (WARNING_PATTERN.test(stripped)) {
      elements.push(renderWarning(stripped.replace(WARNING_PATTERN, '')))
      i++
      continue
    }

    // Bullet list
    if (/^[-*]\s+/.test(stripped)) {
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, '').trim()
        elements.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(itemText) }))
        i++
      }
      continue
    }

    // Numbered list
    if (/^\d+[.)]\s+/.test(stripped)) {
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const nm = /^\s*(\d+)[.)]\s+(.*)$/.exec(lines[i])
        elements.push(new Paragraph({
          indent: { left: 360 },
          children: [new TextRun({ text: `${nm[1]}. ` }), ...inlineRuns(nm[2].trim())],
        }))
        i++
      }
      continue
    }

    // Code block
    if (stripped.startsWith('```')) {
      i++ // skip opening fence
      const codeLines = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing fence
      if (codeLines.length) {
        elements.push(new Paragraph({
          children: [new TextRun({
            text: codeLines.join('\n'),
            font: 'Courier New', size: 18, color: '333333',
          })],
        }))
      }
      continue
    }

    // Regular paragraph — collect consecutive non-special lines
    const paraLines = []
    while (i < lines.length) {
      const current = lines[i].trim()
      if (!current) { i++; break }
      if (
        current.startsWith('#') || current.startsWith('|') || current.startsWith('```')
        || /^[-*]\s+/.test(current) || /^\d+[.)]\s+/.test(current)
        || WARNING_PATTERN.test(current)
      ) break
      paraLines.push(current)
      i++
    }
    if (paraLines.length) {
      elements.push(new Paragraph({ children: inlineRuns(paraLines.join(' ')) }))
    }
  }

  return elements
}

// ── Document assembly ─────────────────────────────────────────────────────────

export function renderDocx(schemaData) {
  const children = []

  children.push(new Paragraph({
    text: schemaData.title ?? 'Untitled Document',
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
  }))

  const sections = schemaData.sections ?? []
  sections.forEach((section, idx) => {
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }))

    if (section.heading) {
      children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }))
    }
    if (section.content) children.push(...renderMarkdown(section.content, 2))

    for (const sub of section.subsections ?? []) {
      if (sub.heading) {
        children.push(new Paragraph({ text: sub.heading, heading: HeadingLevel.HEADING_2 }))
      }
      if (sub.content) children.push(...renderMarkdown(sub.content, 3))
    }
  })

  const doc = new Document({
    creator: 'WWT Ops Hub',
    title: schemaData.title ?? 'Document',
    description: 'Generated by WWT Ops Hub DocGen',
    sections: [{ children }],
  })

  return Packer.toBuffer(doc)
}

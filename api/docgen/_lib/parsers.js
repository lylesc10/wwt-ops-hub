/**
 * File parsers for docgen uploads — ported from field-services
 * backend/app/docgen/parsers/ (excel.py, pdf.py, word.py, csv_parser.py).
 *
 * Each parser takes a Buffer + filename and returns a JSON-safe object:
 *   Excel: { filename, sheets: [{ name, headers, rows }] }
 *   PDF:   { filename, pages: [{ page, text }], page_count }
 *   Word:  { filename, sections: [{ heading, text }], tables }
 *   CSV:   { filename, headers, rows }
 */

import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { logWarn } from '../../_lib/log.js'

export const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.docx', '.doc', '.pdf', '.csv']

function ext(filename) {
  const m = /\.[^.]+$/.exec(filename ?? '')
  return m ? m[0].toLowerCase() : ''
}

function parseExcel(buffer, filename) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheets = wb.SheetNames.map(name => {
    const rows2d = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false })
    const headers = (rows2d[0] ?? []).map(h => (h == null ? '' : String(h)))
    const rows = rows2d.slice(1).map(row => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = row[i] ?? null })
      return obj
    })
    return { name, headers, rows }
  })
  return { filename, sheets }
}

function parseCsv(buffer, filename) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headers = (rows2d[0] ?? []).map(h => (h == null ? '' : String(h)))
  const rows = rows2d.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? null })
    return obj
  })
  return { filename, headers, rows }
}

async function parsePdf(buffer, filename) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    const pages = (result.pages ?? []).map((p, i) => ({ page: p.pageNumber ?? i + 1, text: p.text ?? '' }))
    return { filename, pages, page_count: pages.length }
  } finally {
    await parser.destroy()
  }
}

async function parseWord(buffer, filename) {
  const { value: text } = await mammoth.extractRawText({ buffer })
  // mammoth gives plain text — split into pseudo-sections on blank-line groups
  // to approximate the python-docx heading-based sectioning.
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  const sections = []
  let current = { heading: 'Introduction', paragraphs: [] }
  for (const block of blocks) {
    const firstLine = block.split('\n')[0]
    // Heuristic: short single-line block with no terminal punctuation → heading
    if (!block.includes('\n') && firstLine.length < 80 && !/[.:;,]$/.test(firstLine)) {
      if (current.paragraphs.length) {
        sections.push({ heading: current.heading, text: current.paragraphs.join('\n') })
      }
      current = { heading: firstLine, paragraphs: [] }
    } else {
      current.paragraphs.push(block)
    }
  }
  if (current.paragraphs.length) {
    sections.push({ heading: current.heading, text: current.paragraphs.join('\n') })
  }
  return { filename, sections, tables: [] }
}

/**
 * Parse an uploaded file by extension. Returns parsed_data or a
 * { parse_error, filename } object on failure (matching save_upload()).
 */
export async function parseUpload(buffer, filename) {
  const e = ext(filename)
  try {
    switch (e) {
      case '.xlsx':
      case '.xls':  return parseExcel(buffer, filename)
      case '.csv':  return parseCsv(buffer, filename)
      case '.pdf':  return await parsePdf(buffer, filename)
      case '.docx':
      case '.doc':  return await parseWord(buffer, filename)
      default:      return { parse_error: `Unsupported file type: ${e}`, filename }
    }
  } catch (err) {
    logWarn(`[docgen/parsers] Failed to parse ${filename}:`, err.message)
    return { parse_error: err.message, filename }
  }
}

export function isAllowedExtension(filename) {
  return ALLOWED_EXTENSIONS.includes(ext(filename))
}

/**
 * Reading and writing the expected-guest lists as spreadsheet files, with no library: a CSV is text,
 * and an .xlsx is a zip of XML that the browser can already inflate (`DecompressionStream`).
 *
 * Reading turns a file into the same text the paste box takes, one person per line with the cells
 * joined by a tab, so `parsePlannedLines` is the only place that decides what a line means.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ENTRY_BYTES = 20 * 1024 * 1024

/** UTF-8 (with or without a BOM), else Windows-1251: what Russian Excel writes for «CSV». */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

/** Comma, semicolon (Russian Excel) or tab, whichever the first line uses most. Quotes are honoured. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (delimiter: string) => firstLine.split(delimiter).length - 1
  const delimiter = [';', '\t', ','].reduce((best, next) => (count(next) > count(best) ? next : best), ',')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      endCell()
    } else if (char === '\n') {
      endRow()
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

// ---- .xlsx ----

type ZipEntry = { method: number; name: string; size: number; start: number; compressed: number }

function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 22 - 65_535); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index
      break
    }
  }
  if (end < 0) throw new Error('Это не файл Excel (.xlsx).')

  const count = view.getUint16(end + 10, true)
  const entries: ZipEntry[] = []
  let cursor = view.getUint32(end + 16, true)
  for (let n = 0; n < count && view.getUint32(cursor, true) === 0x02014b50; n += 1) {
    const method = view.getUint16(cursor + 10, true)
    const compressed = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const local = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    entries.push({ method, name, size, start, compressed })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function entryText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_ENTRY_BYTES) throw new Error('Файл слишком большой.')
  const data = bytes.subarray(entry.start, entry.start + entry.compressed)
  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method !== 8) throw new Error('Этот способ сжатия в файле не поддерживается.')
  // The size in the zip header is the file's own claim, so the output is capped as it arrives.
  const reader = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_ENTRY_BYTES) {
      await reader.cancel()
      throw new Error('Файл слишком большой.')
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk, at)
    at += chunk.length
  }
  return new TextDecoder().decode(joined)
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function unescapeXml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10))
    return XML_ENTITIES[name] ?? whole
  })
}

const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => unescapeXml(match[1]!))
    .join('')

function columnIndex(reference: string) {
  let index = 0
  for (const char of reference.replace(/[^A-Z]/gi, '').toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index - 1
}

/**
 * The first worksheet of a workbook as rows of cell text. Formulas show their cached value; dates
 * and numbers show as the number Excel stored, which is fine for an address and a name.
 * ponytail: the first `sheetN.xml` is taken, not the one the workbook lists first; the same unless
 * sheets were reordered. Read workbook.xml and its rels if that ever matters.
 */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = listZip(bytes)
  const sheet = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))[0]
  if (!sheet) throw new Error('В файле нет листа с данными.')

  const stringsEntry = entries.find((entry) => entry.name === 'xl/sharedStrings.xml')
  const strings = stringsEntry
    ? [...(await entryText(bytes, stringsEntry)).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
        textOf(match[1]!),
      )
    : []

  const xml = await entryText(bytes, sheet)
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    let next = 0
    for (const cell of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1]!
      const body = cell[2] ?? ''
      const reference = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1]
      const column = reference ? columnIndex(reference) : next
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''
      if (type === 'inlineStr') row[column] = textOf(body)
      else row[column] = type === 's' ? (strings[Number(raw)] ?? '') : unescapeXml(raw)
      next = column + 1
    }
    rows.push(Array.from(row, (value) => value ?? ''))
  }
  return rows
}

// ---- file <-> paste text ----

/** A header row (no address in it) is dropped; every other row becomes one tab-joined line. */
export function rowsToText(rows: string[][]): string {
  const lines = rows.map((row) => row.map((cell) => cell.trim()).filter(Boolean).join('\t')).filter(Boolean)
  if (lines.length > 0 && !lines[0]!.includes('@')) lines.shift()
  return lines.join('\n')
}

export async function spreadsheetToText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 5 МБ.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // «PK»: an .xlsx
  if (isZip) return rowsToText(await readXlsx(bytes))
  return rowsToText(parseCsv(decodeText(bytes)))
}

/**
 * The people of a list as a CSV that Russian Excel opens correctly: UTF-8 with a BOM, «;» between
 * columns. A value that starts like a formula gets a leading apostrophe, so opening the file never
 * runs anything.
 */
export function plannedCsv(items: ReadonlyArray<{ email: string; fullName: string | null }>): string {
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /[";\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
  }
  const lines = ['Email;ФИО', ...items.map((item) => `${cell(item.email)};${cell(item.fullName ?? '')}`)]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function downloadCsv(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

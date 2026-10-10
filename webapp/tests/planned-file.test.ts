import { expect, test } from 'bun:test'

import {
  decodeText,
  parseCsv,
  plannedCsv,
  readXlsx,
  rowsToText,
} from '../src/features/event/planned-file'
import { parsePlannedLines } from '../src/features/event/planned-model'

/** A zip of the given files, each deflated the way Excel does it. Checksums are left at zero. */
async function zip(files: Record<string, string>, stored = false) {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const encoder = new TextEncoder()

  for (const [name, text] of Object.entries(files)) {
    const raw = encoder.encode(text)
    const data = stored
      ? raw
      : new Uint8Array(
          await new Response(
            new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')),
          ).arrayBuffer(),
        )
    const nameBytes = encoder.encode(name)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(8, stored ? 0 : 8, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, raw.length, true)
    local.setUint16(26, nameBytes.length, true)
    parts.push(new Uint8Array(local.buffer), nameBytes, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(10, stored ? 0 : 8, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, raw.length, true)
    entry.setUint16(28, nameBytes.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), nameBytes)

    offset += 30 + nameBytes.length + data.length
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, Object.keys(files).length, true)
  end.setUint16(10, Object.keys(files).length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const bytes = new Uint8Array(all.reduce((sum, chunk) => sum + chunk.length, 0))
  let at = 0
  for (const chunk of all) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}

const workbook = {
  'xl/sharedStrings.xml':
    '<sst><si><t>Email</t></si><si><t>ФИО</t></si><si><t>anna@example.com</t></si>' +
    '<si><r><t>Анна </t></r><r><t>Петрова &amp; Ко</t></r></si><si><t>oleg@example.com</t></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>' +
    // Column A empty, the address in column B and the name inline in column C.
    '<row r="3"><c r="B3" t="s"><v>4</v></c><c r="C3" t="inlineStr"><is><t>Олег Иванов</t></is></c></row>' +
    '</sheetData></worksheet>',
}

test('reads the first sheet of an .xlsx: shared strings, rich text, inline strings, entities', async () => {
  for (const stored of [false, true]) {
    const rows = await readXlsx(await zip(workbook, stored))
    expect(rows).toEqual([
      ['Email', 'ФИО'],
      ['anna@example.com', 'Анна Петрова & Ко'],
      ['', 'oleg@example.com', 'Олег Иванов'],
    ])
  }

  // The header row is dropped, then the lines are what the paste box would hold.
  const entries = parsePlannedLines(rowsToText(await readXlsx(await zip(workbook)))).entries
  expect(entries).toEqual([
    { email: 'anna@example.com', fullName: 'Анна Петрова & Ко' },
    { email: 'oleg@example.com', fullName: 'Олег Иванов' },
  ])
})

test('a file that is not a workbook is refused with a sentence, not a stack', async () => {
  await expect(readXlsx(new TextEncoder().encode('just text, no zip'))).rejects.toThrow('Excel')
  await expect(readXlsx(await zip({ 'readme.txt': 'no sheet' }))).rejects.toThrow('листа')
})

test('reads CSV from Russian Excel: semicolons, quotes, a BOM and Windows-1251', () => {
  const text = decodeText(
    new TextEncoder().encode('\uFEFFEmail;ФИО\r\nanna@example.com;"Петрова, Анна"\r\n"oleg@example.com";Олег\r\n'),
  )
  expect(parseCsv(text)).toEqual([
    ['Email', 'ФИО'],
    ['anna@example.com', 'Петрова, Анна'],
    ['oleg@example.com', 'Олег'],
  ])

  // «Анна» in Windows-1251: not valid UTF-8, so the fallback decodes it.
  expect(decodeText(new Uint8Array([0xc0, 0xed, 0xed, 0xe0]))).toBe('Анна')

  expect(parseCsv('a@example.com,Анна\nb@example.com,Ольга')).toEqual([
    ['a@example.com', 'Анна'],
    ['b@example.com', 'Ольга'],
  ])
  expect(rowsToText(parseCsv('a@example.com\tАнна'))).toBe('a@example.com\tАнна')
})

test('the exported CSV opens in Excel and cannot run a formula', () => {
  const csv = plannedCsv([
    { email: 'anna@example.com', fullName: 'Петрова; Анна' },
    { email: 'oleg@example.com', fullName: null },
    { email: 'x@example.com', fullName: '=HYPERLINK("http://x")' },
  ])
  expect(csv.startsWith('\uFEFFEmail;ФИО\r\n')).toBe(true)
  expect(csv).toContain('anna@example.com;"Петрова; Анна"\r\n')
  expect(csv).toContain('oleg@example.com;\r\n')
  expect(csv).toContain(`x@example.com;"'=HYPERLINK(""http://x"")"\r\n`)
})

test('a zip that understates its size cannot make the reader inflate without limit', async () => {
  const bomb = await zip({ 'xl/worksheets/sheet1.xml': `<row>${'a'.repeat(25 * 1024 * 1024)}</row>` })
  // Claim a size of one byte in the central directory, as a hostile file would.
  const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength)
  for (let index = 0; index < bomb.length - 4; index += 1) {
    if (view.getUint32(index, true) === 0x02014b50) view.setUint32(index + 24, 1, true)
  }
  await expect(readXlsx(bomb)).rejects.toThrow('большой')
})

import { deflateSync } from 'node:zlib'

const SIZE = 160

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

// Flat, clearly synthetic colours: background, head, shoulders.
const palettes = [
  [[0xcf, 0xe3, 0xf5], [0xf2, 0xc9, 0xa0], [0x3b, 0x6e, 0xa8]],
  [[0xf5, 0xd9, 0xcf], [0xd9, 0xa5, 0x7c], [0xa8, 0x4f, 0x3b]],
  [[0xd7, 0xf0, 0xd6], [0xf0, 0xd0, 0xb0], [0x3f, 0x8a, 0x4f]],
  [[0xea, 0xdd, 0xf5], [0xc8, 0x92, 0x6b], [0x7a, 0x4f, 0xa8]],
  [[0xf5, 0xee, 0xc8], [0xe8, 0xb9, 0x94], [0xc2, 0x8a, 0x2e]],
] as const

/** A drawn placeholder avatar (a head over shoulders on a flat background) as a PNG. No real person. */
export function placeholderPortraitPng(index: number): Buffer {
  const [background, skin, shirt] = palettes[index % palettes.length]!
  const rows: Buffer[] = []
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 3) // filter byte 0 + RGB
    for (let x = 0; x < SIZE; x++) {
      const head = (x - 80) ** 2 + (y - 62) ** 2 <= 30 ** 2
      const shoulders = ((x - 80) / 62) ** 2 + ((y - 168) / 66) ** 2 <= 1
      const [r, g, b] = head ? skin : shoulders ? shirt : background
      row.set([r, g, b], 1 + x * 3)
    }
    rows.push(row)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

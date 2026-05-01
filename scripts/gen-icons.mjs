// Generates PWA PNG icons using only built-in Node.js modules (no canvas/sharp needed).
// Produces solid #0f172a (dark navy) squares — clean, professional, installable.
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

const BG = [15, 23, 42]   // #0f172a
const FG = [248, 250, 252] // #f8fafc

// CRC-32 lookup table
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function makeChunk(type, data) {
  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type)
  const crcVal = crc32(Buffer.concat([typeBuf, data]))
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crcVal)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Draws a rounded-rectangle icon with a centred "$" glyph approximated in pixels.
// The glyph is defined on a 7x10 grid and scaled to ~30% of icon size.
function makePNG(size) {
  const [r, g, b] = BG
  const rowLen = 1 + size * 3
  const raw = Buffer.allocUnsafe(size * rowLen)

  // 7-col × 10-row pixel mask for "$" (1 = foreground)
  const DOLLAR = [
    [0,1,1,1,1,1,0],
    [1,1,0,1,0,1,1],
    [1,1,0,1,0,0,0],
    [0,1,1,1,1,1,0],
    [0,0,0,1,0,1,1],
    [1,1,0,1,0,1,1],
    [0,1,1,1,1,1,0],
  ]

  const cellW = Math.round(size * 0.32 / 7)
  const glyphW = cellW * 7
  const glyphH = cellW * 7
  const offX = Math.round((size - glyphW) / 2)
  const offY = Math.round((size - glyphH) / 2)

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const i = y * rowLen + 1 + x * 3

      // Determine if pixel is inside the "$" glyph
      let fg = false
      const gx = x - offX
      const gy = y - offY
      if (gx >= 0 && gy >= 0 && gx < glyphW && gy < glyphH) {
        const col = Math.floor(gx / cellW)
        const row = Math.floor(gy / cellW)
        if (row < DOLLAR.length && col < 7 && DOLLAR[row][col]) fg = true
      }

      // Vertical stroke through centre of "$"
      const cx = Math.round(size / 2)
      if (Math.abs(x - cx) < Math.max(1, cellW * 0.5) &&
          y >= offY - cellW * 2 && y < offY + glyphH + cellW * 2) fg = true

      raw[i]     = fg ? FG[0] : r
      raw[i + 1] = fg ? FG[1] : g
      raw[i + 2] = fg ? FG[2] : b
    }
  }

  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192x192.png',     makePNG(192))
writeFileSync('public/pwa-512x512.png',     makePNG(512))
writeFileSync('public/apple-touch-icon.png', makePNG(180))
console.log('Icons generated: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png')

// 生成 PWA 图标（PNG）。纯 node 零依赖：手写最小 PNG 编码器（zlib 压缩）。
// 图案：深色底 + 绿色地球圆 + 白色环线 + 底部进度条（60% 填充）。
// 用法：node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// ---- 最小 PNG 编码器 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ---- 绘图 ----
const BG = [20, 20, 40, 255] // #141428
const GREEN = [34, 197, 94, 255] // #22c55e
const WHITE = [255, 255, 255, 255]
const AMBER = [245, 158, 11, 255] // #f59e0b
const DARK = [10, 10, 24, 255]

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size * 0.42
  const earthR = size * 0.3
  const ringR = size * 0.36
  const ringW = Math.max(2, size * 0.02)
  const barW = size * 0.56
  const barH = Math.max(3, size * 0.05)
  const barX = cx - barW / 2
  const barY = size * 0.8
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      let col = BG
      if (dist <= earthR) col = GREEN
      else if (dist <= ringR && dist > ringR - ringW) col = WHITE
      if (x >= barX && x <= barX + barW && y >= barY && y <= barY + barH) {
        col = (x - barX) / barW <= 0.62 ? AMBER : DARK
      }
      rgba[idx] = col[0]
      rgba[idx + 1] = col[1]
      rgba[idx + 2] = col[2]
      rgba[idx + 3] = col[3]
    }
  }
  return encodePng(size, size, rgba)
}

writeFileSync(join(outDir, 'icon-192.png'), draw(192))
writeFileSync(join(outDir, 'icon-512.png'), draw(512))
console.log('icons written to', outDir)

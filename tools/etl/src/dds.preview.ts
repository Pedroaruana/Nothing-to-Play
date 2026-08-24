import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const from565 = (c: number): [number, number, number] => {
  const r = (c >> 11) & 0x1f
  const g = (c >> 5) & 0x3f
  const b = c & 0x1f
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]
}

const run = async () => {
  const file = process.argv[2]!
  const buf = await readFile(file)

  const magic = buf.readUInt32LE(0)
  const height = buf.readUInt32LE(12)
  const width = buf.readUInt32LE(16)
  const fourcc = buf.readUInt32LE(84)

  console.log(`magic ${magic === 0x20534444 ? 'ok' : 'ERRADO'}  ${width}x${height}  fourcc ${fourcc === 0x31545844 ? 'DXT1' : 'ERRADO'}`)

  const data = buf.subarray(128)
  const esperado = (width / 4) * (height / 4) * 8
  console.log(`bytes: ${data.length}, esperado ${esperado} ${data.length === esperado ? 'ok' : 'ERRADO'}`)

  const out = Buffer.alloc(width * height * 3)
  const blocksX = width / 4

  for (let block = 0; block < data.length / 8; block++) {
    const c0 = data.readUInt16LE(block * 8)
    const c1 = data.readUInt16LE(block * 8 + 2)
    const bits = data.readUInt32LE(block * 8 + 4)
    const [r0, g0, b0] = from565(c0)
    const [r1, g1, b1] = from565(c1)
    const pal = [
      [r0, g0, b0],
      [r1, g1, b1],
      [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
      [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3]
    ]
    const bx = block % blocksX
    const by = (block - bx) / blocksX
    for (let i = 0; i < 16; i++) {
      const p = pal[(bits >> (i * 2)) & 3]!
      const at = ((by * 4 + Math.floor(i / 4)) * width + bx * 4 + (i % 4)) * 3
      out[at] = Math.round(p[0]!)
      out[at + 1] = Math.round(p[1]!)
      out[at + 2] = Math.round(p[2]!)
    }
  }

  const w = Number(process.argv[4] ?? 640)
  const h = Number(process.argv[5] ?? 480)

  await sharp(out, { raw: { width, height, channels: 3 } })
    .extract({ left: 0, top: 0, width: Math.min(w, width), height: Math.min(h, height) })
    .png()
    .toFile(process.argv[3]!)

  console.log(`recorte salvo em ${process.argv[3]}`)
}

void run()

import { readdir } from 'node:fs/promises'
import sharp from 'sharp'
import { compressDxt1, ddsHeader } from './dxt1.ts'

// descompressor de referência. existe só pra conferir o compressor: se o erro
// medido aqui for baixo, os bytes que vão pra gpu estão certos
const from565 = (c: number): [number, number, number] => {
  const r = (c >> 11) & 0x1f
  const g = (c >> 5) & 0x3f
  const b = c & 0x1f
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]
}

const decompress = (data: Buffer, width: number, height: number) => {
  const out = Buffer.alloc(width * height * 3)
  const blocksX = width / 4

  for (let block = 0; block < data.length / 8; block++) {
    const c0 = data.readUInt16LE(block * 8)
    const c1 = data.readUInt16LE(block * 8 + 2)
    const bits = data.readUInt32LE(block * 8 + 4)

    const [r0, g0, b0] = from565(c0)
    const [r1, g1, b1] = from565(c1)

    const palette =
      c0 > c1
        ? [
            [r0, g0, b0],
            [r1, g1, b1],
            [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
            [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3]
          ]
        : [
            [r0, g0, b0],
            [r1, g1, b1],
            [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2],
            [0, 0, 0]
          ]

    const bx = block % blocksX
    const by = (block - bx) / blocksX

    for (let i = 0; i < 16; i++) {
      const p = palette[(bits >> (i * 2)) & 3]!
      const x = bx * 4 + (i % 4)
      const y = by * 4 + Math.floor(i / 4)
      const at = (y * width + x) * 3
      out[at] = Math.round(p[0]!)
      out[at + 1] = Math.round(p[1]!)
      out[at + 2] = Math.round(p[2]!)
    }
  }

  return out
}

const W = 64
const H = 64

const run = async () => {
  const files = (await readdir('out/thumbs')).slice(0, 40)
  let somaErro = 0
  let pior = 0

  for (const file of files) {
    const rgb = await sharp(`out/thumbs/${file}`)
      .resize(W, H, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer()

    const packed = compressDxt1(rgb, W, H)
    const back = decompress(packed, W, H)

    let soma = 0
    for (let i = 0; i < rgb.length; i++) {
      const d = rgb[i]! - back[i]!
      soma += d * d
    }

    const rmse = Math.sqrt(soma / rgb.length)
    somaErro += rmse
    if (rmse > pior) pior = rmse
  }

  const medio = somaErro / files.length
  const psnr = 20 * Math.log10(255 / medio)

  console.log(`amostras:      ${files.length}`)
  console.log(`taxa:          ${((W * H * 3) / compressDxt1(Buffer.alloc(W * H * 3), W, H).length).toFixed(1)}:1`)
  console.log(`erro medio:    ${medio.toFixed(2)} (rmse, 0-255)`)
  console.log(`pior caso:     ${pior.toFixed(2)}`)
  console.log(`psnr:          ${psnr.toFixed(1)} dB`)
  // o teto do formato é ~36 dB: a cor de cada extremo é guardada em rgb565, e
  // só a quantização já custa isso. capa pequena tem muito detalhe por pixel,
  // então 26 pra cima é o esperado aqui
  console.log(`veredito:      ${psnr > 26 ? 'ENCODER OK' : 'ENCODER RUIM'} (teto do formato e ~36 dB)`)

  const h = ddsHeader(W, H, 8)
  console.log(`\nheader: magic=${h.readUInt32LE(0) === 0x20534444 ? 'ok' : 'ERRADO'} h=${h.readUInt32LE(12)} w=${h.readUInt32LE(16)} fourcc=${h.readUInt32LE(84) === 0x31545844 ? 'DXT1' : 'ERRADO'}`)
}

void run()

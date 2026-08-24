import { compressDxt1 } from './dxt1.ts'

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
  return out
}

const psnr = (a: Buffer, b: Buffer) => {
  let soma = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!
    soma += d * d
  }
  const rmse = Math.sqrt(soma / a.length)
  return rmse === 0 ? Number.POSITIVE_INFINITY : 20 * Math.log10(255 / rmse)
}

const N = 64
const casos: [string, (x: number, y: number) => [number, number, number], string][] = [
  ['cor solida', () => [120, 80, 200], 'tem que ser perfeito'],
  ['gradiente suave', (x, y) => [(x / N) * 255, (y / N) * 255, 128], 'dxt1 vai muito bem'],
  ['duas cores', (x) => (x < N / 2 ? [255, 0, 0] : [0, 0, 255]), 'tem que ser quase perfeito'],
  ['ruido puro', () => [Math.random() * 255, Math.random() * 255, Math.random() * 255], 'dxt1 vai mal, e normal']
]

for (const [nome, fn, esperado] of casos) {
  const rgb = Buffer.alloc(N * N * 3)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [r, g, b] = fn(x, y)
      const at = (y * N + x) * 3
      rgb[at] = Math.round(r)
      rgb[at + 1] = Math.round(g)
      rgb[at + 2] = Math.round(b)
    }
  }

  const back = decompress(compressDxt1(rgb, N, N), N, N)
  const p = psnr(rgb, back)
  console.log(`${nome.padEnd(18)} ${p === Number.POSITIVE_INFINITY ? 'exato' : p.toFixed(1) + ' dB'}   (${esperado})`)
}

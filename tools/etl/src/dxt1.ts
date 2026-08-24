// compressão DXT1 e escrita de DDS.
//
// o motor do mosaico só aceita textura comprimida nesse formato: ele lê o
// header, confere o fourCC e manda os bytes direto pra gpu com
// compressedTexImage3D. jpg ou webp não servem ali, teriam que ser
// descomprimidos pra rgba antes e o consumo de memória explodiria.
//
// DXT1 trabalha em blocos de 4x4 pixels. cada bloco vira 8 bytes: duas cores
// em rgb565 e dezesseis índices de 2 bits escolhendo entre essas duas cores e
// dois níveis interpolados entre elas. taxa fixa de 8 bits por pixel, metade
// de um rgb sem compressão e um quarto de rgba.

const to565 = (r: number, g: number, b: number) =>
  ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)

/** volta da rgb565 pra rgb888, que é o que a gpu vai ver de fato */
const from565 = (c: number): [number, number, number] => {
  const r = (c >> 11) & 0x1f
  const g = (c >> 5) & 0x3f
  const b = c & 0x1f

  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]
}

/**
 * comprime um bloco de 4x4 em 8 bytes.
 *
 * os dois extremos saem da projeção das cores no eixo de maior variação, não
 * do min e max por canal separadamente: pegar min e max canal a canal produz
 * cores que não existem no bloco e o resultado fica lavado.
 */
const encodeBlock = (rgb: Uint8Array, out: Buffer, at: number) => {
  let minR = 255
  let minG = 255
  let minB = 255
  let maxR = 0
  let maxG = 0
  let maxB = 0

  for (let i = 0; i < 16; i++) {
    const r = rgb[i * 3]!
    const g = rgb[i * 3 + 1]!
    const b = rgb[i * 3 + 2]!

    if (r < minR) minR = r
    if (g < minG) minG = g
    if (b < minB) minB = b
    if (r > maxR) maxR = r
    if (g > maxG) maxG = g
    if (b > maxB) maxB = b
  }

  // eixo principal do bloco, por iteração de potência sobre a covariância.
  // a diagonal da caixa delimitadora, que é o palpite óbvio, aponta para o
  // lado errado sempre que a nuvem de cores é achatada ou torta
  let mr = 0
  let mg = 0
  let mb = 0
  for (let i = 0; i < 16; i++) {
    mr += rgb[i * 3]!
    mg += rgb[i * 3 + 1]!
    mb += rgb[i * 3 + 2]!
  }
  mr /= 16
  mg /= 16
  mb /= 16

  let crr = 0
  let cgg = 0
  let cbb = 0
  let crg = 0
  let crb = 0
  let cgb = 0

  for (let i = 0; i < 16; i++) {
    const dr = rgb[i * 3]! - mr
    const dg = rgb[i * 3 + 1]! - mg
    const db = rgb[i * 3 + 2]! - mb

    crr += dr * dr
    cgg += dg * dg
    cbb += db * db
    crg += dr * dg
    crb += dr * db
    cgb += dg * db
  }

  let axisR = maxR - minR || 1
  let axisG = maxG - minG || 1
  let axisB = maxB - minB || 1

  for (let it = 0; it < 6; it++) {
    const nr = crr * axisR + crg * axisG + crb * axisB
    const ng = crg * axisR + cgg * axisG + cgb * axisB
    const nb = crb * axisR + cgb * axisG + cbb * axisB

    const norma = Math.max(Math.abs(nr), Math.abs(ng), Math.abs(nb))
    if (norma < 1e-6) break

    axisR = nr / norma
    axisG = ng / norma
    axisB = nb / norma
  }

  // projeta cada pixel no eixo e guarda os extremos reais
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  let loIndex = 0
  let hiIndex = 0

  for (let i = 0; i < 16; i++) {
    const d =
      rgb[i * 3]! * axisR + rgb[i * 3 + 1]! * axisG + rgb[i * 3 + 2]! * axisB

    if (d < lo) {
      lo = d
      loIndex = i
    }
    if (d > hi) {
      hi = d
      hiIndex = i
    }
  }

  // extremos iniciais, pegos dos pixels que mais se afastam nas pontas do eixo
  let ar = rgb[hiIndex * 3]!
  let ag = rgb[hiIndex * 3 + 1]!
  let ab = rgb[hiIndex * 3 + 2]!
  let br = rgb[loIndex * 3]!
  let bg = rgb[loIndex * 3 + 1]!
  let bb = rgb[loIndex * 3 + 2]!

  // peso de c0 em cada um dos quatro índices da paleta
  const W = [1, 0, 2 / 3, 1 / 3]
  const indices = new Uint8Array(16)

  // alterna atribuir os pixels à paleta e recalcular os dois extremos que
  // minimizam o erro quadrático. tomar os pixels extremos e parar por aí, que
  // era o que eu fazia, custa uns 6 dB de qualidade
  for (let passo = 0; passo < 4; passo++) {
    const p0r = ar
    const p0g = ag
    const p0b = ab
    const p1r = br
    const p1g = bg
    const p1b = bb

    for (let i = 0; i < 16; i++) {
      const r = rgb[i * 3]!
      const g = rgb[i * 3 + 1]!
      const b = rgb[i * 3 + 2]!

      let best = 0
      let bestDist = Number.POSITIVE_INFINITY

      for (let p = 0; p < 4; p++) {
        const w = W[p]!
        const pr = p1r + (p0r - p1r) * w
        const pg = p1g + (p0g - p1g) * w
        const pb = p1b + (p0b - p1b) * w

        const dr = r - pr
        const dg = g - pg
        const db = b - pb

        // pesos de luminância: o olho perdoa erro no azul e não perdoa no verde
        const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114
        if (dist < bestDist) {
          bestDist = dist
          best = p
        }
      }

      indices[i] = best
    }

    // sistema normal de 2x2: cada pixel é c1 + w*(c0 - c1), resolve pra c0 e c1
    let sww = 0
    let swv = 0
    let svv = 0
    let swR = 0
    let swG = 0
    let swB = 0
    let svR = 0
    let svG = 0
    let svB = 0

    for (let i = 0; i < 16; i++) {
      const w = W[indices[i]!]!
      const v = 1 - w

      sww += w * w
      swv += w * v
      svv += v * v

      swR += w * rgb[i * 3]!
      swG += w * rgb[i * 3 + 1]!
      swB += w * rgb[i * 3 + 2]!
      svR += v * rgb[i * 3]!
      svG += v * rgb[i * 3 + 1]!
      svB += v * rgb[i * 3 + 2]!
    }

    const det = sww * svv - swv * swv
    if (Math.abs(det) < 1e-6) break

    const inv = 1 / det
    const clamp = (x: number) => Math.min(255, Math.max(0, x))

    ar = clamp((svv * swR - swv * svR) * inv)
    ag = clamp((svv * swG - swv * svG) * inv)
    ab = clamp((svv * swB - swv * svB) * inv)
    br = clamp((sww * svR - swv * swR) * inv)
    bg = clamp((sww * svG - swv * swG) * inv)
    bb = clamp((sww * svB - swv * swB) * inv)
  }

  let c0 = to565(Math.round(ar), Math.round(ag), Math.round(ab))
  let c1 = to565(Math.round(br), Math.round(bg), Math.round(bb))

  // c0 > c1 seleciona o modo de quatro cores. no modo de três cores o quarto
  // índice vira transparente, e aqui tudo é opaco
  let trocado = false
  if (c0 < c1) {
    const t = c0
    c0 = c1
    c1 = t
    trocado = true
  }

  // atribuição final já contra as cores quantizadas, que é o que a gpu vê
  const [r0, g0, b0] = from565(c0)
  const [r1, g1, b1] = from565(c1)

  const palette: [number, number, number][] = [
    [r0, g0, b0],
    [r1, g1, b1],
    [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3],
    [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3]
  ]

  void trocado

  let bits = 0

  for (let i = 0; i < 16; i++) {
    const r = rgb[i * 3]!
    const g = rgb[i * 3 + 1]!
    const b = rgb[i * 3 + 2]!

    let best = 0
    let bestDist = Number.POSITIVE_INFINITY

    for (let p = 0; p < 4; p++) {
      const dr = r - palette[p]![0]
      const dg = g - palette[p]![1]
      const db = b - palette[p]![2]

      const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }

    bits |= best << (i * 2)
  }

  out.writeUInt16LE(c0, at)
  out.writeUInt16LE(c1, at + 2)
  out.writeUInt32LE(bits >>> 0, at + 4)
}

/** comprime uma imagem rgb crua inteira. largura e altura têm que ser múltiplas de 4 */
export const compressDxt1 = (rgb: Buffer, width: number, height: number): Buffer => {
  if (width % 4 !== 0 || height % 4 !== 0) {
    throw new Error(`dxt1 exige múltiplo de 4, recebeu ${width}x${height}`)
  }

  const blocksX = width / 4
  const blocksY = height / 4
  const out = Buffer.alloc(blocksX * blocksY * 8)
  const block = new Uint8Array(48)

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      for (let y = 0; y < 4; y++) {
        const row = ((by * 4 + y) * width + bx * 4) * 3
        for (let x = 0; x < 4; x++) {
          const src = row + x * 3
          const dst = (y * 4 + x) * 3
          block[dst] = rgb[src]!
          block[dst + 1] = rgb[src + 1]!
          block[dst + 2] = rgb[src + 2]!
        }
      }

      encodeBlock(block, out, (by * blocksX + bx) * 8)
    }
  }

  return out
}

const DDS_MAGIC = 0x20534444
const FOURCC_DXT1 = 0x31545844

/**
 * header DDS de 128 bytes, no formato que o loader do motor confere: magic,
 * altura em header[3], largura em header[4], flag de fourCC em header[20] e o
 * fourCC em header[21]
 */
export const ddsHeader = (width: number, height: number, dataBytes: number): Buffer => {
  const header = Buffer.alloc(128)

  header.writeUInt32LE(DDS_MAGIC, 0)
  header.writeUInt32LE(124, 4) // tamanho da estrutura
  header.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, 8) // caps, altura, largura, pixelformat, linearsize
  header.writeUInt32LE(height, 12)
  header.writeUInt32LE(width, 16)
  header.writeUInt32LE(dataBytes, 20)
  header.writeUInt32LE(1, 28) // níveis de mipmap

  header.writeUInt32LE(32, 76) // tamanho do pixelformat
  header.writeUInt32LE(0x4, 80) // DDPF_FOURCC
  header.writeUInt32LE(FOURCC_DXT1, 84)
  header.writeUInt32LE(0x1000, 108) // DDSCAPS_TEXTURE

  return header
}

export const writeDds = (rgb: Buffer, width: number, height: number): Buffer => {
  const data = compressDxt1(rgb, width, height)
  return Buffer.concat([ddsHeader(width, height, data.length), data])
}

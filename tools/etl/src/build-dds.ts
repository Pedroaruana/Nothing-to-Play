import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { writeDds } from './dxt1.ts'
import { pool } from './pool.ts'
import type { RawGame } from './types.ts'

// gera as texturas no formato que o motor do mosaico exige: grid de capas
// comprimido em DXT1 dentro de um DDS. o loader dele lê o header, confere o
// fourCC e manda os bytes direto pra gpu, então webp ou jpg não servem ali.
//
// dois níveis, que é o que cabe no repositório:
//   baixo  uma textura só, serve o mosaico inteiro visto de longe
//   médio  seis camadas, entra quando a célula cresce na tela
//
// o nível alto do original, com capa em 120x160, daria 260 MB e ficou de fora.

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'out')
const CACHE_DIR = join(OUT_DIR, 'covers-small')
const MEDIA_DIR = join(HERE, '..', '..', '..', 'apps', 'web', 'public', 'media')

// t_thumb é 90x90 quadrado e obriga a cortar as laterais da capa.
// t_cover_small vem 90x128, que é a proporção real da arte
const COVER_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_small'
const DOWNLOAD_CONCURRENCY = 24

type Level = {
  nome: string
  cellW: number
  cellH: number
  cols: number
  rows: number
  layers: number
}

// largura e altura de cada textura têm que ser múltiplas de 4, senão o DXT1
// não fecha os blocos
const LEVELS: Level[] = [
  { nome: 'low', cellW: 8, cellH: 11, cols: 256, rows: 100, layers: 1 },
  { nome: 'mid', cellW: 24, cellH: 32, cols: 80, rows: 60, layers: 6 }
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const loadCover = async (imageId: string): Promise<Buffer | null> => {
  const cached = join(CACHE_DIR, `${imageId}.jpg`)

  try {
    return await readFile(cached)
  } catch {
    // não está em cache, segue e baixa
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${COVER_URL}/${imageId}.jpg`)
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer())
        await writeFile(cached, buffer)
        return buffer
      }

      if (res.status === 404) return null
    } catch {
      // rede caiu, cai no retry
    }

    await sleep(300 * (attempt + 1))
  }

  return null
}

const run = async () => {
  await mkdir(CACHE_DIR, { recursive: true })

  const games = JSON.parse(
    await readFile(join(OUT_DIR, 'games.json'), 'utf8')
  ) as RawGame[]

  console.log(`acervo: ${games.length} jogos`)

  for (const level of LEVELS) {
    const dir = join(MEDIA_DIR, level.nome, 'dds')
    await mkdir(dir, { recursive: true })

    const width = level.cols * level.cellW
    const height = level.rows * level.cellH
    const porCamada = level.cols * level.rows

    if (width % 4 !== 0 || height % 4 !== 0) {
      throw new Error(`${level.nome}: ${width}x${height} não é múltiplo de 4`)
    }

    console.log(
      `\n${level.nome}: célula ${level.cellW}x${level.cellH}, grid ${level.cols}x${level.rows}, ` +
        `${level.layers} camada(s) de ${width}x${height}, ${porCamada * level.layers} vagas`
    )

    let faltando = 0

    for (let layer = 0; layer < level.layers; layer++) {
      // a camada é montada como pixel cru e comprimida uma vez só no fim
      const canvas = Buffer.alloc(width * height * 3)
      const inicio = layer * porCamada
      const slice = games.slice(inicio, inicio + porCamada)

      if (slice.length === 0) break

      await pool(slice, DOWNLOAD_CONCURRENCY, async (game, offset) => {
        const imageId = game.cover?.image_id
        let pixels: Buffer | null = null

        if (imageId) {
          const source = await loadCover(imageId)

          if (source) {
            try {
              pixels = await sharp(source)
                .resize(level.cellW, level.cellH, { fit: 'cover', position: 'centre' })
                .removeAlpha()
                .raw()
                .toBuffer()
            } catch {
              pixels = null // jpg corrompido no cdn, acontece
            }
          }
        }

        if (!pixels) {
          faltando++
          pixels = Buffer.alloc(level.cellW * level.cellH * 3)
        }

        const col = offset % level.cols
        const row = (offset - col) / level.cols

        for (let y = 0; y < level.cellH; y++) {
          const destino = ((row * level.cellH + y) * width + col * level.cellW) * 3
          pixels.copy(canvas, destino, y * level.cellW * 3, (y + 1) * level.cellW * 3)
        }
      })

      const dds = writeDds(canvas, width, height)
      await writeFile(join(dir, `${layer}.dds`), dds)

      console.log(
        `  camada ${layer}: ${(dds.length / 1024 / 1024).toFixed(2)} MB  ` +
          `(${slice.length} capas)`
      )
    }

    if (faltando > 0) console.log(`  sem capa: ${faltando}`)
  }

  console.log('\npronto')
}

void run()

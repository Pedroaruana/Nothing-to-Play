import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  CELL_H,
  CELL_W,
  COLS,
  HEADER_BYTES,
  PAGE_SIZE,
  PER_PAGE,
  RECORD_BYTES,
  writeHeader,
  writeRecord
} from './atlas-format.ts'
import { pool } from './pool.ts'
import type { RawGame } from './types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'out')
const CACHE_DIR = join(OUT_DIR, 'thumbs')
const PUBLIC_DIR = join(HERE, '..', '..', '..', 'apps', 'web', 'public', 'atlas')

const THUMB_URL = 'https://images.igdb.com/igdb/image/upload/t_thumb'
const DOWNLOAD_CONCURRENCY = 24
const MAX_MASK_BITS = 16 // o manifesto guarda 16 bits por máscara

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// baixa uma vez e guarda em disco. rodar o etl de novo não repete download
const loadThumb = async (imageId: string): Promise<Buffer | null> => {
  const cached = join(CACHE_DIR, `${imageId}.jpg`)

  try {
    return await readFile(cached)
  } catch {
    // não está em cache, segue e baixa
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${THUMB_URL}/${imageId}.jpg`)
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer())
        await writeFile(cached, buffer)
        return buffer
      }

      // 404 é capa que sumiu do cdn, não adianta insistir
      if (res.status === 404) return null
    } catch {
      // rede caiu, cai no retry
    }

    await sleep(300 * (attempt + 1))
  }

  return null
}

// os 16 mais frequentes viram bit de filtro. o resto não cabe em 16 bits e
// seria filtro que quase ninguém usa
const topIds = (games: RawGame[], pick: (game: RawGame) => { id: number; label: string }[]) => {
  const tally = new Map<number, { label: string; total: number }>()

  for (const game of games) {
    for (const item of pick(game)) {
      const current = tally.get(item.id)
      if (current) current.total++
      else tally.set(item.id, { label: item.label, total: 1 })
    }
  }

  return [...tally.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, MAX_MASK_BITS)
    .map(([id, value], bit) => ({ id, bit, label: value.label, total: value.total }))
}

const maskOf = (ids: number[], table: Map<number, number>) => {
  let mask = 0
  for (const id of ids) {
    const bit = table.get(id)
    if (bit !== undefined) mask |= 1 << bit
  }
  return mask
}

const run = async () => {
  const started = Date.now()
  const games = JSON.parse(await readFile(join(OUT_DIR, 'games.json'), 'utf8')) as RawGame[]

  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(PUBLIC_DIR, { recursive: true })

  const genres = topIds(games, (game) =>
    (game.genres ?? []).map((genre) => ({ id: genre.id, label: genre.name }))
  )
  const platforms = topIds(games, (game) =>
    (game.platforms ?? []).map((platform) => ({
      id: platform.id,
      label: platform.abbreviation ?? platform.name
    }))
  )

  const genreBit = new Map(genres.map((genre) => [genre.id, genre.bit]))
  const platformBit = new Map(platforms.map((platform) => [platform.id, platform.bit]))

  const manifest = Buffer.alloc(HEADER_BYTES + games.length * RECORD_BYTES)
  writeHeader(manifest, games.length)

  const pages = Math.ceil(games.length / PER_PAGE)
  const missing: number[] = []

  for (let page = 0; page < pages; page++) {
    const slice = games.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

    // a página é montada como pixel cru e comprimida uma vez só no fim.
    // compor 2880 imagens uma a uma pelo libvips é bem mais lento
    const canvas = Buffer.alloc(PAGE_SIZE * PAGE_SIZE * 3)

    await pool(slice, DOWNLOAD_CONCURRENCY, async (game, offset) => {
      const index = page * PER_PAGE + offset
      const imageId = game.cover?.image_id

      let pixels: Buffer | null = null

      if (imageId) {
        const source = await loadThumb(imageId)

        if (source) {
          try {
            pixels = await sharp(source)
              .resize(CELL_W, CELL_H, { fit: 'cover', position: 'centre' })
              .removeAlpha()
              .raw()
              .toBuffer()
          } catch {
            pixels = null // jpg corrompido no cdn, acontece
          }
        }
      }

      if (!pixels) {
        missing.push(game.id)
        pixels = Buffer.alloc(CELL_W * CELL_H * 3)
      }

      const col = offset % COLS
      const row = Math.floor(offset / COLS)
      const x = col * CELL_W
      const y = row * CELL_H

      // copia linha por linha, a origem é contígua mas o destino tem passo de página
      const sum = [0, 0, 0]

      for (let line = 0; line < CELL_H; line++) {
        const from = line * CELL_W * 3
        const to = ((y + line) * PAGE_SIZE + x) * 3
        pixels.copy(canvas, to, from, from + CELL_W * 3)

        for (let px = 0; px < CELL_W * 3; px += 3) {
          sum[0]! += pixels[from + px]!
          sum[1]! += pixels[from + px + 1]!
          sum[2]! += pixels[from + px + 2]!
        }
      }

      // média da miniatura vira a cor da célula enquanto o atlas não chegou.
      // é a mesma conta de reduzir pra 1x1, só que de graça, já temos os pixels
      const total = CELL_W * CELL_H
      const year = game.first_release_date
        ? new Date(game.first_release_date * 1000).getUTCFullYear()
        : 0

      writeRecord(manifest, index, {
        id: game.id,
        r: Math.round(sum[0]! / total),
        g: Math.round(sum[1]! / total),
        b: Math.round(sum[2]! / total),
        rating: game.total_rating === undefined ? 255 : Math.round(game.total_rating),
        year,
        genreMask: maskOf((game.genres ?? []).map((genre) => genre.id), genreBit),
        platformMask: maskOf((game.platforms ?? []).map((item) => item.id), platformBit)
      })
    })

    const file = join(PUBLIC_DIR, `atlas_${String(page).padStart(3, '0')}.webp`)

    await sharp(canvas, { raw: { width: PAGE_SIZE, height: PAGE_SIZE, channels: 3 } })
      .webp({ quality: 72, effort: 5 })
      .toFile(file)

    const elapsed = ((Date.now() - started) / 1000).toFixed(0)
    console.log(`  página ${page + 1}/${pages} (${slice.length} capas, ${elapsed}s)`)
  }

  await writeFile(join(PUBLIC_DIR, 'manifest.bin'), manifest)
  await writeFile(
    join(PUBLIC_DIR, 'taxonomy.json'),
    JSON.stringify({ genres, platforms }, null, 2)
  )

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n${games.length} capas em ${pages} páginas de atlas (${seconds}s)`)
  console.log(`manifesto: ${(manifest.length / 1024).toFixed(0)} KB`)
  console.log(`capas que o cdn não entregou: ${missing.length}`)
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})

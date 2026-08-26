import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawGame } from './types.ts'

// ficha do jogo aberto: sinopse, data cheia, plataformas e slug.
//
// isso não cabe no manifesto binário, que tem 14 bytes por jogo e é lido
// inteiro na abertura do site. sinopse de 25 mil jogos dá alguns MB, então vai
// em lotes e o front busca só o lote do jogo que foi aberto.

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'out')
const PUBLIC_DIR = join(HERE, '..', '..', '..', 'apps', 'web', 'public', 'info')

/** jogos por arquivo. 500 dá lotes de ~150 KB, que carregam num piscar */
const BATCH = 500

/** sinopse cortada: o cartão mostra poucas linhas e o resto seria peso morto */
const SUMMARY_MAX = 420

export type GameInfo = {
  /** sinopse, já cortada */
  s?: string
  /** data de lançamento, em segundos */
  d?: number
  /** plataformas, já com o rótulo curto */
  p?: string[]
  /** slug no igdb, pro link do jogo */
  g?: string
}

const corta = (texto: string) => {
  if (texto.length <= SUMMARY_MAX) return texto

  // corta na última frase inteira que couber, senão fica pela metade da palavra
  const pedaco = texto.slice(0, SUMMARY_MAX)
  const ponto = Math.max(pedaco.lastIndexOf('. '), pedaco.lastIndexOf('! '), pedaco.lastIndexOf('? '))

  return ponto > SUMMARY_MAX * 0.5 ? pedaco.slice(0, ponto + 1) : `${pedaco.trimEnd()}…`
}

const run = async () => {
  await mkdir(PUBLIC_DIR, { recursive: true })

  const games = JSON.parse(await readFile(join(OUT_DIR, 'games.json'), 'utf8')) as RawGame[]

  const lotes = Math.ceil(games.length / BATCH)
  let comSinopse = 0
  let comData = 0
  let bytes = 0

  for (let lote = 0; lote < lotes; lote++) {
    const fatia = games.slice(lote * BATCH, (lote + 1) * BATCH)

    const registros: GameInfo[] = fatia.map((game) => {
      const info: GameInfo = {}

      if (game.summary) {
        info.s = corta(game.summary)
        comSinopse++
      }

      if (game.first_release_date) {
        info.d = game.first_release_date
        comData++
      }

      const plataformas = (game.platforms ?? [])
        .map((p) => p.abbreviation ?? p.name)
        .filter((p): p is string => Boolean(p))

      if (plataformas.length > 0) info.p = plataformas
      if (game.slug) info.g = game.slug

      return info
    })

    const json = JSON.stringify(registros)
    bytes += Buffer.byteLength(json)
    await writeFile(join(PUBLIC_DIR, `${lote}.json`), json)
  }

  console.log(`${games.length} jogos em ${lotes} lotes de ${BATCH}`)
  console.log(`com sinopse: ${comSinopse}`)
  console.log(`com data:    ${comData}`)
  console.log(`total:       ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  console.log(`por lote:    ${(bytes / lotes / 1024).toFixed(0)} KB`)
}

void run()

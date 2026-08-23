import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticate, query } from './igdb.ts'
import type { RawGame } from './types.ts'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'out')
const PAGE = 500 // teto da igdb por request

// o recorte do acervo: tem capa, é jogo mesmo (não dlc nem bundle) e
// alguém já avaliou. sem a nota entra muito asset flip de loja
const WHERE = 'cover.image_id != null & game_type = 0 & total_rating_count > 0'

const FIELDS = [
  'id',
  'name',
  'slug',
  'summary',
  'first_release_date',
  'total_rating',
  'total_rating_count',
  'aggregated_rating',
  'cover.image_id',
  'genres.id',
  'genres.name',
  'platforms.id',
  'platforms.abbreviation',
  'platforms.name'
].join(', ')

const run = async () => {
  const started = Date.now()
  const creds = await authenticate()

  const { count } = await query<{ count: number }>(creds, 'games/count', `where ${WHERE};`)
  console.log(`acervo: ${count} jogos`)

  // paginação por id em vez de offset: a igdb degrada em offset alto e,
  // se o catálogo mudar no meio da coleta, offset repete ou pula registro
  const games: RawGame[] = []
  let lastId = 0

  while (true) {
    const body = `
      fields ${FIELDS};
      where ${WHERE} & id > ${lastId};
      sort id asc;
      limit ${PAGE};
    `

    const page = await query<RawGame[]>(creds, 'games', body)
    if (page.length === 0) break

    games.push(...page)
    lastId = page[page.length - 1]!.id

    const pct = Math.round((games.length / count) * 100)
    process.stdout.write(`\r  ${games.length}/${count} (${pct}%)`)

    if (page.length < PAGE) break
  }

  // mais avaliado primeiro. isso vira a ordem do mosaico, então as capas
  // conhecidas caem na primeira página de atlas e aparecem antes
  games.sort((a, b) => (b.total_rating_count ?? 0) - (a.total_rating_count ?? 0))

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'games.json'), JSON.stringify(games))

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n${games.length} jogos salvos em out/games.json (${seconds}s)`)
  console.log(`mais avaliado: ${games[0]?.name} (${games[0]?.total_rating_count} notas)`)
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

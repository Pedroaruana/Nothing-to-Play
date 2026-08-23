import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { CELL_H, CELL_W, COLS, ROWS } from './atlas-format.ts'
import type { RawGame } from './types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'out')
const DB_PATH = join(OUT_DIR, 'games.db')
const PUBLIC_DIR = join(HERE, '..', '..', '..', 'apps', 'web', 'public', 'atlas')

// idx é a posição no mosaico e é a mesma ordem do manifesto e do atlas.
// é por ela que o front pergunta "quem é a célula 8412"
const SCHEMA = `
  CREATE TABLE games (
    idx            INTEGER PRIMARY KEY,
    id             INTEGER NOT NULL UNIQUE,
    slug           TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    year           INTEGER,
    rating         INTEGER,
    rating_count   INTEGER NOT NULL,
    critic_rating  INTEGER,
    summary        TEXT,
    cover_image_id TEXT    NOT NULL
  );

  CREATE INDEX games_slug ON games (slug);
  CREATE INDEX games_name ON games (name COLLATE NOCASE);

  CREATE TABLE genres (
    id   INTEGER PRIMARY KEY,
    name TEXT    NOT NULL
  );

  CREATE TABLE platforms (
    id     INTEGER PRIMARY KEY,
    name   TEXT    NOT NULL,
    abbrev TEXT
  );

  CREATE TABLE game_genres (
    game_id  INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, genre_id)
  );

  CREATE TABLE game_platforms (
    game_id     INTEGER NOT NULL,
    platform_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, platform_id)
  );

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

const run = async () => {
  const started = Date.now()
  const games = JSON.parse(await readFile(join(OUT_DIR, 'games.json'), 'utf8')) as RawGame[]

  // o banco é gerado do zero toda vez, é saída de build e não estado
  await rm(DB_PATH, { force: true })

  const db = new DatabaseSync(DB_PATH)
  db.exec(SCHEMA)

  const insertGame = db.prepare(`
    INSERT INTO games (idx, id, slug, name, year, rating, rating_count, critic_rating, summary, cover_image_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertGenre = db.prepare('INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)')
  const insertPlatform = db.prepare(
    'INSERT OR IGNORE INTO platforms (id, name, abbrev) VALUES (?, ?, ?)'
  )
  const linkGenre = db.prepare(
    'INSERT OR IGNORE INTO game_genres (game_id, genre_id) VALUES (?, ?)'
  )
  const linkPlatform = db.prepare(
    'INSERT OR IGNORE INTO game_platforms (game_id, platform_id) VALUES (?, ?)'
  )
  const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')

  // 25 mil inserts fora de transação viraria 25 mil fsync
  db.exec('BEGIN')

  games.forEach((game, idx) => {
    const year = game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : null

    insertGame.run(
      idx,
      game.id,
      game.slug,
      game.name,
      year,
      game.total_rating === undefined ? null : Math.round(game.total_rating),
      game.total_rating_count ?? 0,
      game.aggregated_rating === undefined ? null : Math.round(game.aggregated_rating),
      game.summary ?? null,
      game.cover!.image_id
    )

    for (const genre of game.genres ?? []) {
      insertGenre.run(genre.id, genre.name)
      linkGenre.run(game.id, genre.id)
    }

    for (const platform of game.platforms ?? []) {
      insertPlatform.run(platform.id, platform.name, platform.abbreviation ?? null)
      linkPlatform.run(game.id, platform.id)
    }
  })

  // o front precisa saber a geometria do atlas sem ter que adivinhar
  insertMeta.run('built_at', new Date().toISOString())
  insertMeta.run('games', String(games.length))
  insertMeta.run('cell_w', String(CELL_W))
  insertMeta.run('cell_h', String(CELL_H))
  insertMeta.run('cols', String(COLS))
  insertMeta.run('rows', String(ROWS))

  db.exec('COMMIT')

  // reorganiza as páginas do arquivo e coleta estatística pro planejador
  db.exec('VACUUM')
  db.exec('ANALYZE')

  // nomes na mesma ordem do mosaico. é o que deixa o hover mostrar o título
  // sem precisar de servidor, e depois serve de base pra busca no cliente
  await mkdir(PUBLIC_DIR, { recursive: true })
  await writeFile(join(PUBLIC_DIR, 'names.json'), JSON.stringify(games.map((game) => game.name)))

  // id da imagem no cdn da igdb, pra buscar a capa grande da célula em foco.
  // o atlas tem 32x45 por capa, que serve pro mosaico e não serve pro destaque
  await writeFile(
    join(PUBLIC_DIR, 'covers.json'),
    JSON.stringify(games.map((game) => game.cover!.image_id))
  )

  const total = db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }
  const genres = db.prepare('SELECT COUNT(*) AS n FROM genres').get() as { n: number }
  const platforms = db.prepare('SELECT COUNT(*) AS n FROM platforms').get() as { n: number }

  db.close()

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`${total.n} jogos, ${genres.n} gêneros, ${platforms.n} plataformas (${seconds}s)`)
  console.log('banco em out/games.db')
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})

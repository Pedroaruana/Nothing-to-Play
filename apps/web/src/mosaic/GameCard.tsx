'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '@/src/i18n/LocaleProvider'
import Score from './Score'
import { useGameInfo } from './useGameInfo'

type Props = {
  /** índice do jogo no acervo, é ele que busca a ficha */
  index: number
  name: string
  year: number
  rating: number
  genres: string[]
  /** image_id da capa no cdn da igdb, quando existe */
  coverId: string | null
  onClose: () => void
}

const COVER_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x'
const FAVORITES_KEY = 'ntp:favoritos'

const lerFavoritos = (): number[] => {
  try {
    const cru = localStorage.getItem(FAVORITES_KEY)
    return cru ? (JSON.parse(cru) as number[]) : []
  } catch {
    return [] // modo anônimo ou storage cheio, favoritos são enfeite
  }
}

const Botao = ({
  children,
  ...rest
}: { children: React.ReactNode } & React.ComponentProps<'button'>) => (
  <button
    type="button"
    className="border border-white/20 bg-white/[0.06] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-bone/80 transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-void focus-visible:border-bone focus-visible:outline-none"
    {...rest}
  >
    {children}
  </button>
)

const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer noopener"
    className="border border-white/20 bg-white/[0.06] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-bone/80 transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-void"
  >
    {children}
  </a>
)

// painel do jogo aberto, nas proporções da referência: a capa é o fundo do
// próprio cartão, com gradiente por cima pro texto continuar legível em capa
// clara. sinopse, data e plataformas vêm do lote de ficha, carregado sob demanda
const GameCard = ({ index, name, year, rating, genres, coverId, onClose }: Props) => {
  const { t, locale } = useLocale()
  const info = useGameInfo(index)
  const [favorito, setFavorito] = useState(false)

  useEffect(() => {
    setFavorito(lerFavoritos().includes(index))
  }, [index])

  const alternarFavorito = useCallback(() => {
    const atuais = lerFavoritos()
    const proximos = atuais.includes(index)
      ? atuais.filter((i) => i !== index)
      : [...atuais, index]

    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(proximos))
      setFavorito(proximos.includes(index))
    } catch {
      // sem storage o botão simplesmente não guarda nada
    }
  }, [index])

  const data =
    info?.d !== undefined
      ? new Date(info.d * 1000).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC'
        })
      : null

  const igdbUrl = info?.g
    ? `https://www.igdb.com/games/${info.g}`
    : `https://www.igdb.com/search?type=1&q=${encodeURIComponent(name)}`

  const lojaUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(name)}`

  return (
    <aside className="fixed left-6 top-6 z-30 flex max-h-[min(27rem,76vh)] w-[min(40rem,86vw)] flex-col overflow-hidden rounded-sm border border-white/10 bg-void/70 backdrop-blur-2xl md:left-10 md:top-10">
      {coverId && (
        <>
          <img
            src={`${COVER_URL}/${coverId}.jpg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
          {/* dois gradientes: o horizontal segura o texto à esquerda, o vertical
              fecha o rodapé onde ficam os botões */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-void via-void/90 to-void/30"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/20 to-void/50"
          />
        </>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-6 md:p-7">
        <div className="flex items-start gap-5">
          <h2 className="min-w-0 flex-1 font-display text-[clamp(1.5rem,3vw,2.15rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-bone">
            {name}
            {year > 0 && <span className="font-normal text-bone/45"> ({year})</span>}
          </h2>

          {rating <= 100 && (
            <span className="mt-1 shrink-0 text-bone">
              <Score value={rating} size={46} />
            </span>
          )}
        </div>

        {genres.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <li
                key={genre}
                className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/80"
              >
                {genre}
              </li>
            ))}
          </ul>
        )}

        <p className="max-w-[62ch] text-[14px] leading-[1.55] text-bone/80">
          {info?.s ?? (info === null ? '' : t.noSummary)}
        </p>

        {(data || info?.p?.length) && (
          <dl className="flex flex-wrap gap-x-10 gap-y-3 font-mono text-[10px] uppercase tracking-[0.16em]">
            {data && (
              <div>
                <dt className="text-bone/40">{t.released}</dt>
                <dd className="mt-1 text-bone/85">{data}</dd>
              </div>
            )}

            {info?.p?.length ? (
              <div className="min-w-0">
                <dt className="text-bone/40">{t.platforms}</dt>
                <dd className="mt-1 max-w-[40ch] text-bone/85">{info.p.join(' · ')}</dd>
              </div>
            ) : null}
          </dl>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Link href={igdbUrl}>IGDB</Link>
          <Link href={lojaUrl}>{t.where}</Link>

          <button
            type="button"
            onClick={alternarFavorito}
            aria-pressed={favorito}
            aria-label={favorito ? t.unfavorite : t.favorite}
            title={favorito ? t.unfavorite : t.favorite}
            className={`grid size-9 place-items-center rounded-full border transition-colors duration-300 ${
              favorito
                ? 'border-bone bg-bone text-void'
                : 'border-white/20 bg-white/[0.06] text-bone/70 hover:border-bone hover:text-bone'
            }`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-[17px]" fill={favorito ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
              <path d="M12 20.5s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 8.3a4.4 4.4 0 0 1 7.5 2.6c0 4.9-7.5 9.6-7.5 9.6Z" />
            </svg>
          </button>

          <Botao onClick={onClose}>{t.close}</Botao>
        </div>
      </div>
    </aside>
  )
}

export default GameCard

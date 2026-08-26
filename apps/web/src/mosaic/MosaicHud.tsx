'use client'

import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { useLocale } from '@/src/i18n/LocaleProvider'
import { COUNTS, PRESETS, type PresetId } from './presets'

const GITHUB_URL = 'https://github.com/Pedroaruana/Nothing-to-Play'

type Props = {
  preset: PresetId
  count: number
  onPreset: (preset: PresetId) => void
  onCount: (count: number) => void
  onReplay: () => void
  stats: string | null
  onStats: (on: boolean) => void
}

// os três controles ficam sobre o mosaico, que é claro e agitado. só a cor do
// traço sumia contra as capas, então cada um ganha o próprio disco de vidro
const Icon = ({ children, ...rest }: { children: ReactNode } & ComponentProps<'button'>) => (
  <button
    type="button"
    className="grid size-9 place-items-center rounded-full border border-white/20 bg-void/55 text-bone/80 shadow-[0_2px_12px_rgba(0,0,0,0.55)] backdrop-blur-md transition-colors duration-300 hover:border-white/60 hover:bg-void/80 hover:text-bone focus-visible:border-bone focus-visible:text-bone focus-visible:outline-none"
    {...rest}
  >
    {children}
  </button>
)

const Card = ({
  active,
  children,
  ...rest
}: { active: boolean; children: ReactNode } & ComponentProps<'button'>) => (
  <button
    type="button"
    className={`rounded-sm border transition-colors duration-300 ${
      active ? 'border-bone bg-white/[0.06] text-bone' : 'border-white/15 text-bone/60 hover:border-white/40'
    }`}
    {...rest}
  >
    {children}
  </button>
)

const MosaicHud = ({ preset, count, onPreset, onCount, onReplay, stats, onStats }: Props) => {
  const { t } = useLocale()
  const [panel, setPanel] = useState<'none' | 'settings' | 'info'>('none')
  const [fullscreen, setFullscreen] = useState(false)

  // esc fecha o painel, que é o atalho que todo mundo tenta primeiro
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel('none')
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()

    setFullscreen(!document.fullscreenElement)
  }

  return (
    <>
      <div className="fixed right-6 top-6 z-40 flex items-center gap-2.5 md:right-8 md:top-8">
        <Icon aria-label="Sobre o projeto" onClick={() => setPanel(panel === 'info' ? 'none' : 'info')}>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-[19px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <circle cx="12" cy="12" r="9.25" />
            <path d="M12 10.6v6.2M12 7.4h.01" strokeLinecap="round" />
          </svg>
        </Icon>

        <Icon aria-label="Configurações" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-[19px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4 17 7M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4"
              strokeLinecap="round"
            />
          </svg>
        </Icon>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t.githubLabel}
          className="grid size-9 place-items-center rounded-full border border-white/20 bg-void/55 text-bone/80 shadow-[0_2px_12px_rgba(0,0,0,0.55)] backdrop-blur-md transition-colors duration-300 hover:border-white/60 hover:bg-void/80 hover:text-bone"
        >
          <svg viewBox="0 0 16 16" className="size-[19px]" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>

      {panel !== 'none' && (
        <section className="fixed inset-x-4 top-20 z-40 overflow-hidden rounded-sm border border-white/10 bg-black/70 p-6 backdrop-blur-2xl md:inset-x-auto md:right-8 md:w-[33rem] md:p-7">
          {panel === 'info' ? (
            <div className="space-y-4 text-sm leading-relaxed text-bone/65">
              <h2 className="font-display text-2xl text-bone">Nothing to Play?</h2>
              <p>
                Mosaico de {count.toLocaleString('pt-BR')} capas resolvido por pixel num diagrama de potência,
                com as células movidas por simulação de forças e iluminadas por raymarching sobre o campo de
                distância.
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40">
                dados e capas por igdb
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              <div>
                <h3 className="font-display text-lg text-bone">Preset</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                    <Card key={id} active={preset === id} onClick={() => onPreset(id)}>
                      <span className="block px-4 py-5 text-left font-display text-base">
                        {PRESETS[id].label}
                      </span>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg text-bone">Jogos</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {COUNTS.map((value) => (
                    <Card key={value} active={count === value} onClick={() => onCount(value)}>
                      <span className="block px-3 py-2.5 font-mono text-[11px] tracking-[0.1em]">
                        {value.toLocaleString('pt-BR')}
                      </span>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex cursor-pointer items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-bone/60">
                  <input
                    type="checkbox"
                    checked={stats !== null}
                    onChange={(event) => onStats(event.target.checked)}
                    className="size-4 accent-bone"
                  />
                  medidor
                </label>

                <label className="flex cursor-pointer items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-bone/60">
                  <input
                    type="checkbox"
                    checked={fullscreen}
                    onChange={toggleFullscreen}
                    className="size-4 accent-bone"
                  />
                  tela cheia
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={() => setPanel('none')}
                  className="border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.26em] text-bone/70 transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-void"
                >
                  fechar
                </button>

                <button
                  type="button"
                  onClick={onReplay}
                  className="border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.26em] text-bone/70 transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-void"
                >
                  rever intro
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {stats && (
        <p className="pointer-events-none fixed bottom-6 right-6 z-30 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/45 md:bottom-8 md:right-8">
          {stats}
        </p>
      )}
    </>
  )
}

export default MosaicHud

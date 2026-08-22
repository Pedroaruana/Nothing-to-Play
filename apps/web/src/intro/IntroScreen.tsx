'use client'

import { useCallback, useEffect, useState } from 'react'
import { useReducedMotion } from '@/src/hooks/useReducedMotion'
import { useLocale } from '@/src/i18n/LocaleProvider'
import LocaleToggle from '@/src/i18n/LocaleToggle'
import GameShelf from './GameShelf'

// painel da intro. não é rota separada, fica em cima do canvas que já tá rodando.
// ao entrar ele desce e o fundo acelera junto, então não tem corte nem loading

type Props = {
  onEnter: () => void // avisa a página pra câmera do fundo mergulhar
  onDone: () => void // saída terminou, o mosaico pode assumir
}

// tem que bater com a duração da transição do painel lá embaixo
const EXIT_MS = 1000

const GITHUB_URL = 'https://github.com/Pedroaruana/Nothing-to-Play'

const IntroScreen = ({ onEnter, onDone }: Props) => {
  const reduced = useReducedMotion()
  const { t } = useLocale()
  const [ready, setReady] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // dispara a entrada só depois da primeira pintura, senão o stagger não aparece
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // updater funcional pra clique e tecla não dispararem a saída duas vezes
  const enter = useCallback(() => {
    setLeaving((current) => {
      if (current) return current
      onEnter()
      return true
    })
  }, [onEnter])

  // quem cronometra a saída é o painel, o fundo só recebe o aviso e mergulha junto
  useEffect(() => {
    if (!leaving) return

    const id = window.setTimeout(onDone, reduced ? 0 : EXIT_MS)
    return () => window.clearTimeout(id)
  }, [leaving, onDone, reduced])

  // enter ou espaço em qualquer lugar da tela, sem precisar mirar no botão
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      enter()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enter])

  // são 3 estados na real: escondido antes da primeira pintura, visível e saindo
  const shown = ready && !leaving

  // mesma curva em tudo, senão cada pedaço parece de um projeto diferente
  const easing = { transitionTimingFunction: 'var(--ease-out-expo)' }

  return (
    <div className="fixed inset-0 z-10 select-none">
      <header
        className="absolute inset-x-0 top-0 flex items-start justify-between px-6 pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/40 transition-all duration-700 md:px-10 md:pt-8"
        style={{ ...easing, opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(-8px)' }}
      >
        <span className="text-bone/70">ntp</span>

        <div className="flex items-center gap-4">
          <LocaleToggle />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={t.githubLabel}
            className="text-bone/45 transition-colors duration-300 hover:text-bone focus-visible:outline-none focus-visible:text-bone"
          >
            <svg viewBox="0 0 16 16" className="size-[18px]" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </header>

      {/* translúcido de propósito, o corredor de placas continua aparecendo atrás */}
      <section
        className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/10 bg-white/[0.025] backdrop-blur-2xl transition-all"
        style={{
          ...easing,
          transitionDuration: leaving ? `${EXIT_MS}ms` : '1100ms',
          transform: leaving ? 'translateY(101%)' : shown ? 'none' : 'translateY(24px)',
          opacity: leaving ? 0 : shown ? 1 : 0
        }}
      >
        {/* faixa de luz percorrendo a borda superior do painel */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px animate-[sweep_7s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-bone/70 to-transparent"
        />

        <div className="grid gap-10 px-6 py-9 md:grid-cols-12 md:items-end md:gap-12 md:px-10 md:py-11">
          <div className="md:col-span-7">
            {/* cada linha sobe de dentro da máscara com atraso diferente.
                o pb na máscara é pra perna do "g" não ser cortada, e o -mb
                devolve o espaço pra entrelinha continuar a mesma */}
            <h1 className="font-display text-[clamp(2.6rem,8.5vw,7rem)] font-medium leading-[0.86] tracking-[-0.045em]">
              {t.title.map((line, index) => (
                <span key={line} className="-mb-[0.18em] block overflow-hidden pb-[0.18em]">
                  <span
                    className="block transition-transform duration-[900ms]"
                    style={{
                      ...easing,
                      transitionDelay: shown ? `${180 + index * 110}ms` : '0ms',
                      transform: shown ? 'none' : 'translateY(125%)'
                    }}
                  >
                    {line}
                    {index === 1 && <span className="font-light text-bone/25">?</span>}
                  </span>
                </span>
              ))}
            </h1>

            <p
              className="mt-6 max-w-md text-sm leading-relaxed text-bone/50 transition-all duration-700"
              style={{
                ...easing,
                transitionDelay: shown ? '520ms' : '0ms',
                opacity: shown ? 1 : 0,
                transform: shown ? 'none' : 'translateY(10px)'
              }}
            >
              {t.lede}
            </p>
          </div>

          <div
            className="flex flex-col gap-6 transition-all duration-700 md:col-span-5"
            style={{
              ...easing,
              transitionDelay: shown ? '620ms' : '0ms',
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(14px)'
            }}
          >
            <GameShelf />

            <div>
              <button
                type="button"
                onClick={enter}
                className="group relative flex w-full items-center justify-between overflow-hidden border border-white/15 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.3em] text-bone/80 transition-colors duration-500 hover:border-bone hover:text-void focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bone"
              >
                {/* preenchimento sobe da base no hover, sem piscar cor */}
                <span
                  aria-hidden
                  className="absolute inset-0 origin-bottom scale-y-0 bg-bone transition-transform duration-500 group-hover:scale-y-100"
                  style={easing}
                />
                <span className="relative">{t.enter}</span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="relative size-4 transition-transform duration-500 group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                >
                  <path d="M4 12h15M13 6l6 6-6 6" />
                </svg>
              </button>

              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.26em] text-bone/20">
                {t.hint}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default IntroScreen

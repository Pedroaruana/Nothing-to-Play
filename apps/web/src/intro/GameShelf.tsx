'use client'

import { useReducedMotion } from '@/src/hooks/useReducedMotion'

// lista provisória, sai quando o ETL do IGDB entrar
const TITLES = [
  'Hollow Knight',
  'Elden Ring',
  'Hades',
  'Disco Elysium',
  'Bloodborne',
  'Celeste',
  'Outer Wilds',
  'Obra Dinn',
  'Inside',
  'Death Stranding',
  'Sekiro',
  'Dead Cells',
  'NieR: Automata',
  'Portal 2',
  'The Witcher 3',
  'Red Dead 2',
  'Katana Zero',
  'Tunic',
  'Stardew Valley',
  'Cuphead',
  'Journey',
  'Undertale',
  "Baldur's Gate 3",
  'Control',
  'Metroid Dread',
  'Resident Evil 4',
  'Slay the Spire',
  'Firewatch',
  'Silent Hill 2',
  'Shadow of the Colossus',
  'Divinity 2',
  'Titanfall 2'
]

// tons de lombada, todos bem dessaturados pra não brigar com o campo atrás
const TINTS = ['#8b93b6', '#b6a68b', '#8bb6a2', '#b68b8b', '#9d8bb6', '#8bafb6']

type SpineProps = { title: string; index: number }

const Spine = ({ title, index }: SpineProps) => {
  // tamanho sai do índice. se usar random aqui quebra a hidratação
  const width = 17 + ((index * 7) % 14)
  const height = 88 + ((index * 13) % 30)
  const tint = TINTS[index % TINTS.length]

  return (
    <div
      className="group/spine relative shrink-0 overflow-hidden rounded-[2px] border border-white/10 transition-transform duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-2.5"
      style={{
        width,
        height,
        background: `linear-gradient(180deg, ${tint}2b 0%, ${tint}12 48%, #00000066 100%)`
      }}
    >
      {/* brilho da quina, dá volume de caixa */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-white/20" />
      <span aria-hidden className="absolute inset-y-0 right-0 w-px bg-black/40" />

      <span className="absolute inset-x-0 top-2 flex justify-center">
        <span className="max-h-[86px] overflow-hidden font-mono text-[8px] uppercase tracking-[0.16em] whitespace-nowrap text-bone/40 transition-colors duration-500 group-hover/spine:text-bone [writing-mode:vertical-rl]">
          {title}
        </span>
      </span>
    </div>
  )
}

// estante de lado, as lombadas correm em loop e param no hover.
// o loop sem emenda é a lista duplicada + animação parando em -50%
const GameShelf = () => {
  const reduced = useReducedMotion()
  const row = [...TITLES, ...TITLES] // duplicado pro loop não ter emenda

  return (
    <div
      className="group relative h-[128px] overflow-hidden"
      style={{
        maskImage: 'linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)'
      }}
    >
      <div
        className="absolute bottom-0 flex items-end gap-[3px] will-change-transform group-hover:[animation-play-state:paused]"
        // com reduced motion fica parada, senão roda em 0.01ms e pisca
        style={reduced ? undefined : { animation: 'shelf 58s linear infinite' }}
      >
        {row.map((title, index) => (
          <Spine key={`${title}-${index}`} title={title} index={index % TITLES.length} />
        ))}
      </div>

      {/* chão da estante */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-white/15" />
    </div>
  )
}

export default GameShelf

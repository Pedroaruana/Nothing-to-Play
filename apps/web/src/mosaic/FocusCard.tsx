'use client'

type Props = {
  name: string
  year: number
  rating: number
  genres: string[]
  /** posição do item em foco na tela, em pixel de css */
  x: number
  y: number
}

// círculo de nota igual ao da referência: anel fino que preenche conforme o valor
const Score = ({ value }: { value: number }) => {
  const radius = 17
  const circumference = 2 * Math.PI * radius

  return (
    <span className="relative grid size-11 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className="relative font-display text-[13px] font-medium">
        {value}
        <span className="text-[8px] align-super">%</span>
      </span>
    </span>
  )
}

const FocusCard = ({ name, year, rating, genres, x, y }: Props) => (
  <div
    className="pointer-events-none fixed z-30 w-[min(24rem,44vw)] -translate-x-full -translate-y-1/2 transition-[left,top] duration-500 ease-[var(--ease-out-expo)]"
    style={{ left: `${x}px`, top: `${y}px` }}
  >
    {rating <= 100 && (
      <div className="mb-3 text-bone drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
        <Score value={rating} />
      </div>
    )}

    {genres.length > 0 && (
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {genres.map((genre) => (
          <li
            key={genre}
            className="rounded-full bg-white/85 px-2.5 py-[3px] text-[10px] font-medium text-void"
          >
            {genre}
          </li>
        ))}
      </ul>
    )}

    <h2 className="font-display text-[clamp(1.6rem,3.4vw,2.9rem)] font-semibold leading-none tracking-[-0.02em] text-bone drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]">
      {name}
      {year > 0 && <span className="ml-2 font-normal text-bone/45">({year})</span>}
    </h2>
  </div>
)

export default FocusCard

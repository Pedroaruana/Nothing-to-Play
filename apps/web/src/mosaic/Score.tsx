// círculo de nota igual ao da referência: anel fino que preenche conforme o
// valor. usado no cartão que segue o cursor e no painel do jogo aberto
type Props = { value: number; size?: number }

const Score = ({ value, size = 44 }: Props) => {
  const radius = 17
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
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
      <span className="relative font-display font-medium" style={{ fontSize: size * 0.3 }}>
        {value}
        <span className="align-super" style={{ fontSize: size * 0.18 }}>
          %
        </span>
      </span>
    </span>
  )
}

export default Score

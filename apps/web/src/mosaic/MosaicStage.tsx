'use client'

import { useEffect, useState } from 'react'

// lugar do mosaico de verdade (engine instanciado + atlas das capas).
// por enquanto só assume a tela e deixa o campo do fundo rodando
const MosaicStage = () => {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-1000"
      style={{ opacity: shown ? 1 : 0 }}
    >
      <p className="absolute bottom-6 left-6 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/35 md:bottom-8 md:left-10">
        acervo 001 / 25.000 capas
      </p>
    </div>
  )
}

export default MosaicStage

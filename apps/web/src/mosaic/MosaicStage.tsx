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
    </div>
  )
}

export default MosaicStage

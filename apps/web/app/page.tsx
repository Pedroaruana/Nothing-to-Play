'use client'

import { useCallback, useState } from 'react'
import AmbientField from '@/src/background/AmbientField'
import IntroScreen from '@/src/intro/IntroScreen'
import MosaicStage from '@/src/mosaic/MosaicStage'
import type { Phase } from '@/src/state/phase'

// o campo fica fora do if de propósito: não desmonta na troca de fase,
// aí intro e mosaico dividem o mesmo canvas e a mesma câmera
const Home = () => {
  const [phase, setPhase] = useState<Phase>('intro')

  const handleEnter = useCallback(() => setPhase('leaving'), [])
  const handleDone = useCallback(() => setPhase('mosaic'), [])

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <AmbientField phase={phase} />
      {phase === 'mosaic' ? (
        <MosaicStage />
      ) : (
        <IntroScreen onEnter={handleEnter} onDone={handleDone} />
      )}
    </main>
  )
}

export default Home

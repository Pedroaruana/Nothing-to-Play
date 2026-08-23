'use client'

import { useCallback, useState } from 'react'
import AmbientField from '@/src/background/AmbientField'
import IntroScreen from '@/src/intro/IntroScreen'
import MosaicStage from '@/src/mosaic/MosaicStage'
import type { Phase } from '@/src/state/phase'

// o campo fica fora do if de propósito: não desmonta na troca de fase, aí a
// intro e o mergulho acontecem no mesmo canvas. ele só sai quando o mosaico
// tem a primeira página de capas na mão, senão a tela pisca preta no meio
const Home = () => {
  const [phase, setPhase] = useState<Phase>('intro')
  const [mosaicReady, setMosaicReady] = useState(false)

  const handleEnter = useCallback(() => setPhase('leaving'), [])
  const handleDone = useCallback(() => setPhase('mosaic'), [])
  const handleMosaicReady = useCallback(() => setMosaicReady(true), [])

  // rever intro: volta pro começo e deixa o campo ambiente assumir de novo
  const handleReplay = useCallback(() => {
    setMosaicReady(false)
    setPhase('intro')
  }, [])

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {!mosaicReady && <AmbientField phase={phase} />}
      {phase === 'mosaic' ? (
        <MosaicStage onReady={handleMosaicReady} onReplay={handleReplay} />
      ) : (
        <IntroScreen onEnter={handleEnter} onDone={handleDone} />
      )}
    </main>
  )
}

export default Home

import { useEffect, useState } from 'react'

// ficha do jogo aberto. o etl publica em lotes de 500 (tools/etl/src/build-info.ts)
// justamente pra não baixar 8 MB de sinopse na abertura do site: aqui entra só
// o lote de quem foi clicado, uns 174 KB, e ele fica em cache pro resto da sessão

export type GameInfo = {
  /** sinopse */
  s?: string
  /** lançamento, em segundos */
  d?: number
  /** plataformas */
  p?: string[]
  /** slug no igdb */
  g?: string
}

const BATCH = 500
const cache = new Map<number, Promise<GameInfo[]>>()

const carregarLote = (lote: number) => {
  const emCache = cache.get(lote)
  if (emCache) return emCache

  const pedido = fetch(`/info/${lote}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<GameInfo[]>) : []))
    .catch(() => [] as GameInfo[])

  cache.set(lote, pedido)
  return pedido
}

export const useGameInfo = (index: number | null) => {
  const [info, setInfo] = useState<GameInfo | null>(null)

  useEffect(() => {
    if (index === null || index < 0) {
      setInfo(null)
      return
    }

    let vivo = true
    setInfo(null)

    void carregarLote(Math.floor(index / BATCH)).then((lote) => {
      if (vivo) setInfo(lote[index % BATCH] ?? null)
    })

    return () => {
      vivo = false
    }
  }, [index])

  return info
}

'use client'

import { useEffect, useState } from 'react'

/** Segue a preferência do sistema e reage se o usuário mudar com a página aberta. */
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)

    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

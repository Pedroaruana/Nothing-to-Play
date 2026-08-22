'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { DICT, type Dict, type Locale } from './dictionary'

type Value = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: Dict
}

const STORAGE_KEY = 'ntp:locale'

const LocaleContext = createContext<Value | null>(null)

export const LocaleProvider = ({ children }: { children: ReactNode }) => {
  // começa em pt fixo pro html do servidor bater com o do cliente.
  // a preferência real só entra depois que monta, senão dá erro de hidratação
  const [locale, setLocale] = useState<Locale>('pt')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    if (saved === 'pt' || saved === 'en') {
      setLocale(saved)
      return
    }

    setLocale(navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en')
  }, [])

  // o lang do html tem que acompanhar, é o que leitor de tela usa
  useEffect(() => {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en'
  }, [locale])

  const change = useCallback((next: Locale) => {
    setLocale(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const value = useMemo(
    () => ({ locale, setLocale: change, t: DICT[locale] }),
    [locale, change]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useLocale = () => {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale precisa estar dentro do LocaleProvider')

  return ctx
}

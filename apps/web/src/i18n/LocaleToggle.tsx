'use client'

import { useLocale } from './LocaleProvider'
import type { Locale } from './dictionary'

const OPTIONS: Locale[] = ['pt', 'en']

// dois botões e uma barra no meio. o ativo fica aceso, o outro apagado
const LocaleToggle = () => {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t.localeLabel}>
      {OPTIONS.map((option, index) => (
        <span key={option} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-bone/15">/</span>}
          <button
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={locale === option}
            className={`uppercase transition-colors duration-300 hover:text-bone focus-visible:text-bone focus-visible:outline-none ${
              locale === option ? 'text-bone' : 'text-bone/30'
            }`}
          >
            {option}
          </button>
        </span>
      ))}
    </div>
  )
}

export default LocaleToggle

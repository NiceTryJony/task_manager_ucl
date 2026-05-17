'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Lang, type TranslationKey } from './i18n'

interface I18nCtx { lang: Lang; t: (key: TranslationKey) => string; setLang: (l: Lang) => void }
const Ctx = createContext<I18nCtx>({ lang: 'en', t: k => k, setLang: () => {} })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('uk')

  useEffect(() => {
    const saved = (localStorage.getItem('taskflow_lang') as Lang) ?? 'uk'
    setLangState(saved)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('taskflow_lang', l)
  }

  const t = (key: TranslationKey): string =>
    (translations[lang][key] ?? translations.en[key] ?? key) as string

  return <Ctx.Provider value={{ lang, t, setLang }}>{children}</Ctx.Provider>
}

export function useI18n() { return useContext(Ctx) }
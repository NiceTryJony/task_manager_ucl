'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

interface ThemeCtx { theme: Theme; toggleTheme: () => void }
const Ctx = createContext<ThemeCtx>({ theme: 'dark', toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = (localStorage.getItem('taskflow_theme') as Theme) ?? 'dark'
    apply(saved)
  }, [])

  function apply(t: Theme) {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('taskflow_theme', t)
  }

  return (
    <Ctx.Provider value={{ theme, toggleTheme: () => apply(theme === 'dark' ? 'light' : 'dark') }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() { return useContext(Ctx) }
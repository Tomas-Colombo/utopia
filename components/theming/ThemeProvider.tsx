'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'utopia-theme'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Resolution order (design §8.6): stored preference → OS preference → light.
 * SSR-safe: returns the default without touching `window` when it doesn't
 * exist yet (server render pass).
 */
function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isTheme(stored)) return stored

  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'

  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')

  // Resolve the real initial theme only after mount — avoids touching
  // `window`/`localStorage`/`matchMedia` during SSR. Deliberately renders the
  // safe 'light' default first (matching what SSR emits) and syncs from the
  // client-only store in an effect; this is the standard SSR-safe
  // theme-provider pattern (design §8.6) and the reason it must run in an
  // effect rather than a lazy `useState` initializer, which would compute
  // the client value on the very first (hydrating) render and mismatch the
  // server-rendered markup.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external-store sync on mount, not a derived-state anti-pattern
    setThemeState(resolveInitialTheme())
  }, [])

  // Reflect the active theme on <html> via `data-theme` so Tailwind's
  // `@theme inline` custom properties (app/globals.css) swap correctly.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function setTheme(next: Theme) {
    setThemeState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

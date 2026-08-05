'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME,
  readStoredTheme,
  writeStoredTheme,
  type Theme,
} from './themeStorage'

// Re-exported so existing importers (`persistThemePreference`,
// `themeConfiguracionPayload`) keep their entry point.
export type { Theme }

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

/**
 * The native `storage` event only fires in OTHER tabs, so a write in this tab
 * has to announce itself. Listening to both also gets cross-tab sync for free.
 */
const THEME_EVENT = 'utopia:theme-change'

function subscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(THEME_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(THEME_EVENT, onStoreChange)
  }
}

const getServerSnapshot = (): Theme => DEFAULT_THEME

/**
 * Theme state, read straight from localStorage through `useSyncExternalStore`
 * (design §8.6).
 *
 * This is not the older "default to light, then correct in an effect" pattern.
 * That approach paints the wrong theme first and fixes it after hydration,
 * which is a visible flash — unacceptable now that the default is dark while
 * the CSS `:root` palette is light. Instead:
 *
 *   1. The root layout ships `data-theme="dark"` in the HTML.
 *   2. A blocking inline script in <head> corrects it from localStorage before
 *      the first paint.
 *   3. This store reads the same key, so React agrees with the DOM.
 *
 * `useSyncExternalStore` is what makes step 3 safe: it renders the server
 * snapshot while hydrating and re-renders with the client value afterwards, so
 * a stored preference that differs from the default does not raise a hydration
 * mismatch the way a lazy `useState` initializer would.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot)

  // Reflect the active theme on <html> so Tailwind's `@theme inline` custom
  // properties (app/globals.css) swap. On a normal load this re-applies what
  // the inline script already set; it earns its keep on toggle and cross-tab.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    writeStoredTheme(next)
    window.dispatchEvent(new Event(THEME_EVENT))
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

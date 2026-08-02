'use client'

import { useTheme } from './ThemeProvider'
import { persistThemePreference } from './persistThemePreference'

/**
 * Global theme switch (REQ-DS-06 — reachable from every route). Fixed to the
 * top-right corner so it floats above whatever route is mounted, including
 * the auth screens that have no Topbar.
 *
 * Design system v2 renders it as a mono pill labelled with the theme it
 * switches TO — "OSCURO" while light, "CLARO" while dark. The icon stays as a
 * non-text cue; the label is what makes the action unambiguous.
 *
 * The (app) topbar reserves `pr-24` on its right edge for this pill; widening
 * the label means widening that reservation too.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  function handleClick() {
    const next = isDark ? 'light' : 'dark'
    setTheme(next)
    // Fire-and-forget: survives device changes (REQ-DS-06).
    void persistThemePreference(next)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="fixed right-3 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-panel px-3.5 py-[7px] font-mono text-[10px] uppercase tracking-[0.12em] text-muted shadow-sm transition-colors hover:border-rosa hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span>{isDark ? 'Claro' : 'Oscuro'}</span>
    </button>
  )
}

function MoonIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

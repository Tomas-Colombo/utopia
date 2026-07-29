'use client'

import { useTheme } from './ThemeProvider'
import { persistThemePreference } from './persistThemePreference'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  function handleClick() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    // Fire-and-forget: survives device changes (REQ-DS-06). Stubbed until
    // Slice 4 task 4.7 wires the real `configuracion` DAL write.
    void persistThemePreference(next)
  }

  return (
    <button type="button" onClick={handleClick} aria-label="Toggle theme">
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </button>
  )
}

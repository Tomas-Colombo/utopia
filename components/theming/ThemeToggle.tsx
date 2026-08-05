'use client'

import { useTheme } from './ThemeProvider'
import { persistThemePreference } from './persistThemePreference'

/**
 * Sidebar theme switch (REQ-DS-06). Rendered inline inside the sidebar
 * footer — matches the logout button styling and collapses to icon-only
 * when the rail is collapsed.
 */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  function handleClick() {
    const next = isDark ? 'light' : 'dark'
    setTheme(next)
    void persistThemePreference(next)
  }

  const label = isDark ? 'Modo claro' : 'Modo oscuro'

  return (
    <button
      type="button"
      onClick={handleClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={`mt-2.5 flex w-full items-center gap-[11px] rounded-md py-2 text-[13px] font-medium text-sidebar-ink transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa ${
        collapsed ? 'justify-center px-0' : 'px-[13px]'
      }`}
    >
      <span className="shrink-0" aria-hidden>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      {!collapsed && <span>{label}</span>}
    </button>
  )
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

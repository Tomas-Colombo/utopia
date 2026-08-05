/**
 * Single source of truth for theme persistence.
 *
 * Both the React provider AND the blocking inline script in the root layout
 * read from here, which is the whole point: if the two ever disagreed on the
 * storage key or the default, the page would paint one theme and then snap to
 * the other. Keeping the script a derived string guarantees they cannot drift.
 *
 * Deliberately free of 'use client' — the root layout is a Server Component
 * and needs to import the script text.
 */

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'utopia-theme'

/**
 * Theme on a first visit, before the user has chosen anything.
 *
 * This intentionally OVERRIDES `prefers-color-scheme`. The previous
 * resolution order was stored -> OS preference -> light; the product decision
 * is that Utopía opens dark for everyone the first time, and only an explicit
 * choice by the user changes it. That choice then wins forever, because
 * `readStoredTheme` checks storage before falling back here.
 */
export const DEFAULT_THEME: Theme = 'dark'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/** Stored preference, or the default. Safe on the server and in private mode. */
export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    // Safari private mode and hardened webviews throw on access.
    return DEFAULT_THEME
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Losing persistence is survivable; crashing the toggle is not.
  }
}

/**
 * Runs synchronously while the browser parses <head>, so `data-theme` is set
 * BEFORE the first paint (Next.js guide: "How to prevent flash before
 * hydration").
 *
 * An effect cannot do this job: `useEffect` runs after hydration and after
 * paint, so every visitor would see a flash of the wrong theme — glaring now
 * that the default is dark and the CSS `:root` palette is light.
 *
 * On throw there is nothing to do: the root layout already ships
 * `data-theme="dark"` in the markup, which is the same fallback.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:${JSON.stringify(
  DEFAULT_THEME,
)})}catch(e){}})()`

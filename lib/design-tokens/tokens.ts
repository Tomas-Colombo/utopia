/**
 * Light-theme design tokens — mirror of the `:root` block in `app/globals.css`
 * (tema "Grafito + Lino"). That stylesheet is what the browser renders; this
 * module exists so the jsdom contrast suite can assert against real hex values,
 * since Vitest never runs the Tailwind PostCSS build. KEEP THE TWO IN STEP.
 *
 * The key names are the legacy ones the suite already used (`card`, `border`,
 * `text`, ...) plus the new channels (`accent`, `warn`, `block`).
 * `alertaBg` / `warnBg` are `color-mix(... 10%, bg)` in the stylesheet; here
 * they are the resolved hex of that mix so the suite can measure them.
 */
export const lightTokens = {
  bg: '#F3F0EE',
  text: '#141416',
  topbar: 'rgba(243,240,238,.85)',
  border: '#EFECE8',
  border2: '#E4E1DC',
  card: '#FFFFFF',
  card2: '#F8F6F4',
  card3: '#EFECE8',
  card4: '#E4E1DC',
  sidebarBg: '#141416',
  // Lino: the main action, the active nav marker, the current day. Text on it
  // is always `accentInk`.
  accent: '#EDE4D3',
  accentInk: '#141416',
  // Primary button on a light page; inverts in dark.
  block: '#141416',
  blockInk: '#F1F0EE',
  // Bookings / about-to-expire channel. `warn` is for borders and fills;
  // `warnInk` is the only one that is AA as small text.
  warn: '#B37A12',
  warnInk: '#8A5C0C',
  warnBg: '#EDE4DA',
  // "Pagada": an ink dot, no green.
  success: '#141416',
  muted: '#4A4A50',
  muted2: '#7A7A80',
  // Alert channel: errors, danger, negative values. `alerta` is darkened from
  // the theme file's #B4442F because that pair measured 4.26:1 on `alertaBg`.
  // `alertaOn` is the foreground for `alertaInk`, which cannot be derived: it
  // is a DARK red here and a LIGHT one in dark mode, so the readable text
  // flips with the theme.
  alerta: '#A93D29',
  alertaBg: '#EEDEDA',
  alertaInk: '#7E2A1B',
  alertaOn: '#FAF8F4',
} as const

export type ThemeTokenKey = keyof typeof lightTokens
// Widened to `string` (not the literal light-theme hexes) so `darkTokens`
// can hold its own distinct hex values under the same key shape.
export type DesignTokens = Record<ThemeTokenKey, string>

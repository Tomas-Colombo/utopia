import type { DesignTokens } from './tokens'

/**
 * Dark-theme design tokens — mirror of the `:root[data-theme="dark"]` block in
 * `app/globals.css`. That stylesheet is what the browser actually renders; this
 * module exists so the jsdom contrast suite
 * (`tests/a11y/design-system-contrast.test.tsx`) can assert against real hex
 * values, since Vitest never runs the Tailwind PostCSS build. KEEP THE TWO IN
 * STEP — a drift here turns the a11y test into a false green.
 *
 * The accent stays lino in both themes (it is light on dark and on light), and
 * `accentInk` stays near-black, so that pair never flips.
 *
 * `sidebarBg` is NOT held constant across themes. The rail is dark in both,
 * but dark mode takes it darker still.
 */
export const darkTokens: DesignTokens = {
  bg: '#0F0F11',
  text: '#F1F0EE',
  topbar: 'rgba(15,15,17,.85)',
  border: '#26262B',
  border2: '#34343A',
  card: '#18181B',
  card2: '#1E1E22',
  card3: '#1E1E22',
  card4: '#2A2A2F',
  sidebarBg: '#0B0B0D',
  accent: '#EDE4D3',
  accentInk: '#141416',
  block: '#F1F0EE',
  blockInk: '#141416',
  warn: '#EDBE7A',
  warnInk: '#EDBE7A',
  warnBg: '#211D1B',
  success: '#F1F0EE',
  muted: '#B4B4BA',
  muted2: '#8C8C93',
  alerta: '#E58C78',
  alertaBg: '#2A1A17',
  alertaInk: '#F2B3A5',
  alertaOn: '#17150F',
}

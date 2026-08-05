import type { DesignTokens } from './tokens'

/**
 * Derived dark-theme design tokens — the "platino" palette, mirroring the
 * `:root[data-theme="dark"]` block in `app/globals.css`. That stylesheet is
 * what the browser actually renders; this module exists so the jsdom contrast
 * suite (`tests/a11y/demo-contrast.test.tsx`) can assert against real hex
 * values, since Vitest never runs the Tailwind PostCSS build. KEEP THE TWO IN
 * STEP — a drift here turns the a11y test into a false green.
 *
 * Platino replaces the earlier warm-asphalt ("chocolate") dark theme: the axis
 * is cold graphite instead of brown, and `accentPink` is no longer pink at all
 * — the accent is platinum. Pink survives only in the `--alerta-*` channel
 * (globals.css), which has no counterpart here because the demo screen does
 * not render an alert surface.
 *
 * `sidebarBg` is NOT held constant across themes. The rail is dark in both,
 * but dark mode takes it darker still, which is what globals.css has done
 * since the v2 palette landed.
 */
export const darkTokens: DesignTokens = {
  bg: '#0C0D0F',
  text: '#F4F6F8',
  topbar: 'rgba(12,13,15,.85)',
  border: '#282C31',
  border2: '#3B4148',
  card: '#15171A',
  card2: '#1B1E22',
  card3: '#20242A',
  card4: '#2E343B',
  sidebarBg: '#08090B',
  accentPink: '#C4CDD6',
  pinkBg: '#232930',
  pinkStrong: '#E4EAF0',
  terracota: '#9BA7B2',
  success: '#6FD39A',
  muted: '#B9C0C7',
  muted2: '#8E97A0',
  alerta: '#F0AEC4',
  alertaBg: '#2E1E26',
  alertaInk: '#F4BFD0',
  alertaOn: '#17150F',
}

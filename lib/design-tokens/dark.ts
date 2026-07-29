import type { DesignTokens } from './tokens'

/**
 * Derived dark-theme design tokens — verbatim source of truth from design
 * §8.3. Neutrals invert lightness; accents keep hue but raise lightness for
 * WCAG 2.1 AA contrast against `--bg`. `sidebarBg` is intentionally
 * UNCHANGED (REQ-DS-07): the sidebar stays dark in both themes.
 */
export const darkTokens: DesignTokens = {
  bg: '#1A1815',
  text: '#EDE9E3',
  topbar: 'rgba(26,24,21,.85)',
  border: '#33302B',
  border2: '#3B372F',
  card: '#232019',
  card2: '#26221B',
  card3: '#2B2720',
  card4: '#2E2A22',
  sidebarBg: '#131312',
  accentPink: '#E9A6BC',
  pinkBg: '#3A2630',
  pinkStrong: '#E58AA6',
  terracota: '#D89A78',
  success: '#4FB574',
  muted: '#B3ACA1',
  muted2: '#938C82',
}

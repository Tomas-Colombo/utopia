/**
 * Light-theme design tokens — verbatim source of truth from design §8.2.
 * Every hex below is copied exactly from `Utopía Sistema Oficial .html`
 * via the exploration/design phase. Do not "round" or "simplify" values.
 */
export const lightTokens = {
  bg: '#F7F5F1',
  text: '#141210',
  topbar: 'rgba(247,245,241,.85)',
  border: '#EAE5DE',
  border2: '#E7E2DA',
  card: '#FCF6F0',
  card2: '#FBFAF7',
  card3: '#F0ECE6',
  card4: '#EFEAE2',
  sidebarBg: '#131312',
  accentPink: '#E9A6BC',
  pinkBg: '#F7E4EA',
  pinkStrong: '#C2607F',
  terracota: '#B87A5A',
  success: '#3E8E5A',
  muted: '#5A5652',
  muted2: '#8A837A',
  // Alert channel. In light it is the rosa accent by another name — the split
  // only does work in dark, where the accent turns platinum and alerts do not.
  // `alertaOn` is the foreground for `alertaInk`, which cannot be derived: it
  // is a DARK pink here and a LIGHT pink in dark mode, so the readable text
  // flips with the theme.
  alerta: '#E9A6BC',
  alertaBg: '#F7E4EA',
  alertaInk: '#C2607F',
  alertaOn: '#FAF8F4',
} as const

export type ThemeTokenKey = keyof typeof lightTokens
// Widened to `string` (not the literal light-theme hexes) so `darkTokens`
// can hold its own distinct hex values under the same key shape.
export type DesignTokens = Record<ThemeTokenKey, string>

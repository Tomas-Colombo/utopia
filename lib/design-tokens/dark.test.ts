import { describe, expect, it } from 'vitest'
import { darkTokens } from './dark'
import { lightTokens } from './tokens'

/**
 * WCAG 2.1 relative-luminance / contrast-ratio helpers, written directly in
 * this test file per the Slice 2 instructions (axe-core does not expose a
 * pure ratio function usable outside a rendered DOM tree).
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return [r, g, b]
}

function channelToLinear(channel255: number): number {
  const srgb = channel255 / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA)
  const luminanceB = relativeLuminance(hexB)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('darkTokens', () => {
  it('defines the exact hex values of the Grafito + Lino dark palette', () => {
    expect(darkTokens.bg).toBe('#0F0F11')
    expect(darkTokens.text).toBe('#F1F0EE')
    expect(darkTokens.sidebarBg).toBe('#0B0B0D')
    expect(darkTokens.accent).toBe('#EDE4D3')
    expect(darkTokens.accentInk).toBe('#141416')
    expect(darkTokens.warnInk).toBe('#EDBE7A')
    expect(darkTokens.alerta).toBe('#E58C78')
  })

  it('exposes the same token shape as lightTokens', () => {
    expect(Object.keys(darkTokens).sort()).toEqual(Object.keys(lightTokens).sort())
  })

  // REQ-DS-07 as it actually shipped: the rail is dark in BOTH themes, and
  // dark mode takes it darker still rather than holding it constant. The
  // assertion is on luminance, not a literal, so re-tuning the palette does
  // not require editing the test — only breaking the invariant does.
  it('keeps the navigation rail dark in both themes, and darker in dark mode', () => {
    expect(relativeLuminance(darkTokens.sidebarBg)).toBeLessThan(
      relativeLuminance(lightTokens.sidebarBg),
    )
    expect(contrastRatio(lightTokens.sidebarBg, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  describe('WCAG 2.1 AA contrast against --bg (≥4.5:1 body text)', () => {
    it('text vs bg meets AA', () => {
      expect(contrastRatio(darkTokens.text, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
    })

    it('warn-ink vs bg and vs warn-bg meets AA', () => {
      expect(contrastRatio(darkTokens.warnInk, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(darkTokens.warnInk, darkTokens.warnBg)).toBeGreaterThanOrEqual(4.5)
    })

    it('success (the "Pagada" dot) vs bg meets AA', () => {
      expect(contrastRatio(darkTokens.success, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
    })

    it('muted and muted-2 vs bg meet AA', () => {
      expect(contrastRatio(darkTokens.muted, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(darkTokens.muted2, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
    })

    it('alerta and alerta-ink vs alerta-bg meet AA', () => {
      expect(contrastRatio(darkTokens.alerta, darkTokens.alertaBg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(darkTokens.alertaInk, darkTokens.alertaBg)).toBeGreaterThanOrEqual(4.5)
    })

    it('alerta-on vs alerta-ink, accent-ink vs accent and block-ink vs block meet AA', () => {
      expect(contrastRatio(darkTokens.alertaOn, darkTokens.alertaInk)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(darkTokens.accentInk, darkTokens.accent)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(darkTokens.blockInk, darkTokens.block)).toBeGreaterThanOrEqual(4.5)
    })
  })
})

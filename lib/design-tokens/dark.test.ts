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
  it('defines the exact hex values of the platino palette', () => {
    expect(darkTokens.bg).toBe('#0C0D0F')
    expect(darkTokens.text).toBe('#F4F6F8')
    expect(darkTokens.sidebarBg).toBe('#08090B')
    expect(darkTokens.accentPink).toBe('#C4CDD6')
    expect(darkTokens.pinkStrong).toBe('#E4EAF0')
    expect(darkTokens.terracota).toBe('#9BA7B2')
    expect(darkTokens.success).toBe('#6FD39A')
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

    it('terracota vs bg meets AA', () => {
      expect(contrastRatio(darkTokens.terracota, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
    })

    it('success vs bg meets AA', () => {
      expect(contrastRatio(darkTokens.success, darkTokens.bg)).toBeGreaterThanOrEqual(4.5)
    })
  })
})

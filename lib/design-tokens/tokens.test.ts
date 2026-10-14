import { describe, expect, it } from 'vitest'
import { lightTokens } from './tokens'

function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const srgb = parseInt(hex.slice(i, i + 2), 16) / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('lightTokens', () => {
  it('defines the exact hex values of the Grafito + Lino palette', () => {
    expect(lightTokens.bg).toBe('#F3F0EE')
    expect(lightTokens.text).toBe('#141416')
    expect(lightTokens.sidebarBg).toBe('#141416')
    expect(lightTokens.accent).toBe('#EDE4D3')
    expect(lightTokens.accentInk).toBe('#141416')
    expect(lightTokens.warn).toBe('#B37A12')
    expect(lightTokens.warnInk).toBe('#8A5C0C')
  })

  it('exposes the full token shape the theming system depends on', () => {
    const expectedKeys = [
      'bg',
      'text',
      'topbar',
      'border',
      'border2',
      'card',
      'card2',
      'card3',
      'card4',
      'sidebarBg',
      'accent',
      'accentInk',
      'block',
      'blockInk',
      'warn',
      'warnInk',
      'warnBg',
      'success',
      'muted',
      'muted2',
      'alerta',
      'alertaBg',
      'alertaInk',
      'alertaOn',
    ].sort()

    expect(Object.keys(lightTokens).sort()).toEqual(expectedKeys)
  })

  // The alert channel is the only place errors are read as small text, so each
  // pair that components actually use is guarded here (and rendered in the
  // jsdom suite). `alerta` on `alertaBg` measured 4.26:1 with the theme file's
  // #B4442F, which is why it was darkened.
  describe('WCAG 2.1 AA contrast (>=4.5:1) for the alert and warn channels', () => {
    it('alerta vs alerta-bg meets AA', () => {
      expect(contrastRatio(lightTokens.alerta, lightTokens.alertaBg)).toBeGreaterThanOrEqual(4.5)
    })

    it('alerta-ink vs alerta-bg meets AA', () => {
      expect(contrastRatio(lightTokens.alertaInk, lightTokens.alertaBg)).toBeGreaterThanOrEqual(4.5)
    })

    it('alerta vs bg and vs card meet AA', () => {
      expect(contrastRatio(lightTokens.alerta, lightTokens.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(lightTokens.alerta, lightTokens.card)).toBeGreaterThanOrEqual(4.5)
    })

    it('alerta-on vs alerta-ink meets AA', () => {
      expect(contrastRatio(lightTokens.alertaOn, lightTokens.alertaInk)).toBeGreaterThanOrEqual(4.5)
    })

    it('warn-ink vs warn-bg, bg and card meet AA', () => {
      expect(contrastRatio(lightTokens.warnInk, lightTokens.warnBg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(lightTokens.warnInk, lightTokens.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(lightTokens.warnInk, lightTokens.card)).toBeGreaterThanOrEqual(4.5)
    })

    it('muted (the lightest text token components use) vs bg and card meets AA', () => {
      expect(contrastRatio(lightTokens.muted, lightTokens.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(lightTokens.muted, lightTokens.card)).toBeGreaterThanOrEqual(4.5)
    })

    it('accent-ink vs accent and block-ink vs block meet AA', () => {
      expect(contrastRatio(lightTokens.accentInk, lightTokens.accent)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(lightTokens.blockInk, lightTokens.block)).toBeGreaterThanOrEqual(4.5)
    })
  })
})

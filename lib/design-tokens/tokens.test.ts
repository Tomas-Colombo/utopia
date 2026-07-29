import { describe, expect, it } from 'vitest'
import { lightTokens } from './tokens'

describe('lightTokens', () => {
  it('defines the exact hex values from design §8.2', () => {
    expect(lightTokens.bg).toBe('#F7F5F1')
    expect(lightTokens.text).toBe('#141210')
    expect(lightTokens.sidebarBg).toBe('#131312')
    expect(lightTokens.accentPink).toBe('#E9A6BC')
    expect(lightTokens.terracota).toBe('#B87A5A')
    expect(lightTokens.success).toBe('#3E8E5A')
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
      'accentPink',
      'pinkBg',
      'pinkStrong',
      'terracota',
      'success',
      'muted',
      'muted2',
    ].sort()

    expect(Object.keys(lightTokens).sort()).toEqual(expectedKeys)
  })
})

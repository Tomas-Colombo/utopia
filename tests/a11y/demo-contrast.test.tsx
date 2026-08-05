import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import { lightTokens, type ThemeTokenKey } from '@/lib/design-tokens/tokens'
import { darkTokens } from '@/lib/design-tokens/dark'
import DemoPage from '../../app/demo/page'

afterEach(() => {
  cleanup()
  document.head.querySelectorAll('style[data-test-tokens]').forEach((el) => el.remove())
  document.documentElement.removeAttribute('data-theme')
})

// Maps each design-token key to the Tailwind utility-class SUFFIX it drives,
// exactly matching the `@theme inline` block in app/globals.css (source of
// truth for the mapping, not guessed).
const TOKEN_CLASS_SUFFIX: Record<ThemeTokenKey, string> = {
  bg: 'bg',
  text: 'text',
  topbar: 'topbar',
  border: 'border',
  border2: 'border-2',
  card: 'card',
  card2: 'card-2',
  card3: 'card-3',
  card4: 'card-4',
  sidebarBg: 'sidebar',
  accentPink: 'accent-pink',
  pinkBg: 'pink-bg',
  pinkStrong: 'pink-strong',
  terracota: 'terracota',
  success: 'success',
  muted: 'muted',
  muted2: 'muted-2',
  alerta: 'alerta',
  alertaBg: 'alerta-bg',
  alertaInk: 'alerta-ink',
  alertaOn: 'alerta-on',
}

/**
 * Builds a minimal literal-color stylesheet mapping the Tailwind utility
 * classes the demo tree actually renders to REAL hex values from
 * `lib/design-tokens/*` (single source of truth).
 *
 * WHY this exists: Vitest/jsdom never runs the Tailwind 4 PostCSS build, so
 * `@theme inline` custom-property resolution and Tailwind's generated
 * utility CSS are unavailable in this environment. Without this stylesheet,
 * every element would compute a transparent background / default black
 * text in jsdom. Because the hex values come directly from the same
 * `tokens.ts`/`dark.ts` files the app imports at runtime, a REAL contrast
 * regression in the tokens still fails this test.
 */
function buildTokenStylesheet(tokens: Record<ThemeTokenKey, string>): string {
  const rules = (Object.keys(TOKEN_CLASS_SUFFIX) as ThemeTokenKey[])
    .map((key) => {
      const suffix = TOKEN_CLASS_SUFFIX[key]
      const value = tokens[key]
      return `.bg-${suffix}{background-color:${value};}\n.text-${suffix}{color:${value};}\n.border-${suffix}{border-color:${value};}`
    })
    .join('\n')

  return `
    html, body { background-color: ${tokens.bg}; color: ${tokens.text}; }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    ${rules}
  `
}

function injectStylesheet(css: string) {
  const style = document.createElement('style')
  style.setAttribute('data-test-tokens', 'true')
  style.textContent = css
  document.head.appendChild(style)
}

// --- WCAG 2.1 contrast math (same formula as lib/design-tokens/dark.test.ts) ---

function channelToLinear(channel255: number): number {
  const srgb = channel255 / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const luminanceA = relativeLuminance(a)
  const luminanceB = relativeLuminance(b)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

function parseRgb(rgbString: string): [number, number, number, number] | null {
  const match = rgbString.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
}

function getDirectText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim()
}

function isVisuallyHidden(el: Element): boolean {
  return (
    el.closest('.sr-only') !== null ||
    el.closest('[aria-hidden="true"]') !== null ||
    el.closest('[hidden]') !== null
  )
}

/** Walks up the ancestor chain for the nearest non-transparent background. */
function getEffectiveBackground(el: Element): [number, number, number] {
  let node: Element | null = el
  while (node) {
    const parsed = parseRgb(getComputedStyle(node).backgroundColor)
    if (parsed && parsed[3] > 0) return [parsed[0], parsed[1], parsed[2]]
    node = node.parentElement
  }
  return [255, 255, 255]
}

interface ContrastFailure {
  text: string
  ratio: number
  html: string
}

/**
 * Real WCAG 2.1 AA contrast walker over the rendered DOM.
 *
 * WHY not axe-core's `color-contrast` rule: axe-core's implementation
 * requires `HTMLCanvasElement.getContext()` (used internally to detect icon
 * font ligatures before it will evaluate contrast — see
 * `hasRealTextChildren` in axe-core). jsdom does not implement Canvas
 * without the native `canvas` npm package, which is not installed in this
 * project (a new native devDependency was intentionally NOT added — see the
 * apply report). Without it, axe silently moves every color-contrast result
 * into `incomplete` (never `violations`), which would make an axe-based
 * assertion here a permanent no-op smoke test — verified empirically:
 * a deliberately broken near-white-on-white stylesheet still produced zero
 * axe violations. This walker computes the SAME WCAG 2.1 contrast formula
 * directly against `getComputedStyle` (real cascade resolution, no canvas
 * dependency) so a genuine contrast regression actually fails the test.
 */
function findContrastFailures(container: HTMLElement, minRatio = 4.5): ContrastFailure[] {
  const failures: ContrastFailure[] = []
  const candidates = container.querySelectorAll<HTMLElement>('*')

  candidates.forEach((el) => {
    const text = getDirectText(el)
    if (!text) return
    if (isVisuallyHidden(el)) return

    const fg = parseRgb(getComputedStyle(el).color)
    if (!fg) return

    const ratio = contrastRatio([fg[0], fg[1], fg[2]], getEffectiveBackground(el))
    if (ratio < minRatio) {
      failures.push({ text, ratio: Number(ratio.toFixed(2)), html: el.outerHTML.slice(0, 160) })
    }
  })

  return failures
}

describe('demo screen accessibility — color contrast (REQ-DS-04/17)', () => {
  it('has zero AA (>=4.5:1) color-contrast failures in the light theme', async () => {
    document.documentElement.setAttribute('data-theme', 'light')
    injectStylesheet(buildTokenStylesheet(lightTokens))

    const { container } = render(<DemoPage />)

    // Also run axe-core for structural a11y coverage (roles, labels, ARIA
    // attribute validity) — NOT relied on for color-contrast in this
    // environment (see findContrastFailures doc comment above).
    await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })

    expect(findContrastFailures(container)).toEqual([])
  })

  it('has zero AA (>=4.5:1) color-contrast failures in the dark theme', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    injectStylesheet(buildTokenStylesheet(darkTokens))

    const { container } = render(<DemoPage />)

    await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })

    expect(findContrastFailures(container)).toEqual([])
  })
})

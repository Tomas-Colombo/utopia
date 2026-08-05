/**
 * Capability gate for the animated auth backdrop.
 *
 * This is a cheap PRE-filter, not the final word. No static signal reliably
 * identifies a weak Android tablet: `hardwareConcurrency` reports 8 on a
 * Galaxy Tab A9 (big.LITTLE octa-core) exactly as it does on a Tab S9, and
 * `WEBGL_debug_renderer_info` is increasingly blocked for fingerprinting
 * reasons. So this function only rejects the cases we can prove, and the real
 * decision is made at runtime by the FPS watchdog in `HillsCanvas`.
 *
 * Every branch fails CLOSED: anything we cannot verify returns 'none' and the
 * static backdrop is used. A login screen must never depend on the GPU.
 */

/** Quality tiers. 'none' means: do not load three.js at all. */
export type BackdropTier = 'none' | 'medium' | 'high'

/** Tiers that actually mount a canvas. */
export type ShaderTier = Exclude<BackdropTier, 'none'>

type NavigatorWithHints = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

export function detectBackdropTier(): BackdropTier {
  // SSR / non-browser.
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'none'

  // Without matchMedia we cannot honour reduced motion, so we do not animate.
  if (typeof window.matchMedia !== 'function') return 'none'

  // WCAG 2.3.3 — a continuously moving landscape is a vestibular trigger.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'none'

  const nav = window.navigator as NavigatorWithHints

  // Respect Data Saver: ~150 KB of three.js for decoration is not a fair trade.
  if (nav.connection?.saveData === true) return 'none'

  // Reported RAM of 2 GB or less is a reliable low-end signal when present.
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return 'none'

  if (!hasAcceleratedWebGL()) return 'none'

  // Coarse pointer => touch device. Same shader, far fewer vertices.
  return window.matchMedia('(pointer: coarse)').matches ? 'medium' : 'high'
}

/**
 * Probes for a hardware-backed WebGL2 context on a throwaway canvas.
 *
 * `failIfMajorPerformanceCaveat` is the important flag: it makes the browser
 * refuse the context instead of silently handing back a software rasteriser
 * (SwiftShader/llvmpipe). Software rendering this shader would peg the CPU.
 *
 * The probe context is released immediately — browsers cap the number of live
 * WebGL contexts (~16), and leaking one per page load would eventually starve
 * the real renderer.
 */
function hasAcceleratedWebGL(): boolean {
  let probe: HTMLCanvasElement | null = null
  try {
    probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    }) as WebGL2RenderingContext | null

    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    // Some hardened/embedded webviews throw rather than returning null.
    return false
  } finally {
    probe?.remove()
  }
}

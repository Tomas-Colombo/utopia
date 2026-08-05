import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectBackdropTier } from './deviceCapability'

/**
 * The gate must fail CLOSED: any signal it cannot verify has to end up on the
 * static backdrop, because a login screen may never depend on the GPU.
 *
 * `tests/setup.ts` already installs a `matchMedia` stub that answers `false`
 * to everything; these helpers override it per case, the same way
 * `Skeleton.test.tsx` does.
 */

function stubMatchMedia(matching: Record<string, boolean> = {}) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matching[query] === true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

/** Fake accelerated WebGL2 context. Returns the `loseContext` spy so tests can
 *  assert the probe releases the context it opened. */
function stubWebGL(available: boolean) {
  const loseContext = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    kind: string,
  ) => {
    if (kind !== 'webgl2' || !available) return null
    return { getExtension: () => ({ loseContext }) } as unknown as WebGL2RenderingContext
  }) as typeof HTMLCanvasElement.prototype.getContext)
  return { loseContext }
}

function stubNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(window.navigator, key, { configurable: true, value })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  stubNavigator({ deviceMemory: undefined, connection: undefined })
})

describe('detectBackdropTier', () => {
  it('returns high on a desktop with accelerated WebGL2', () => {
    stubMatchMedia()
    stubWebGL(true)

    expect(detectBackdropTier()).toBe('high')
  })

  it('drops to medium on a coarse pointer so touch devices get fewer vertices', () => {
    stubMatchMedia({ '(pointer: coarse)': true })
    stubWebGL(true)

    expect(detectBackdropTier()).toBe('medium')
  })

  it('refuses to animate when the user asked for reduced motion', () => {
    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    stubWebGL(true)

    expect(detectBackdropTier()).toBe('none')
  })

  it('refuses when Data Saver is on', () => {
    stubMatchMedia()
    stubWebGL(true)
    stubNavigator({ connection: { saveData: true } })

    expect(detectBackdropTier()).toBe('none')
  })

  it('refuses on devices reporting 2 GB of RAM or less', () => {
    stubMatchMedia()
    stubWebGL(true)
    stubNavigator({ deviceMemory: 2 })

    expect(detectBackdropTier()).toBe('none')
  })

  it('refuses when no accelerated WebGL2 context is available', () => {
    stubMatchMedia()
    stubWebGL(false)

    expect(detectBackdropTier()).toBe('none')
  })

  it('refuses when getContext throws instead of returning null', () => {
    stubMatchMedia()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('context creation blocked')
    })

    expect(detectBackdropTier()).toBe('none')
  })

  it('refuses when matchMedia is unavailable, since reduced motion is unknowable', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    })
    stubWebGL(true)

    expect(detectBackdropTier()).toBe('none')
  })

  it('releases the probe context so it does not count against the WebGL limit', () => {
    stubMatchMedia()
    const { loseContext } = stubWebGL(true)

    detectBackdropTier()

    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('requests the probe with failIfMajorPerformanceCaveat to reject software rendering', () => {
    stubMatchMedia()
    stubWebGL(true)

    detectBackdropTier()

    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl2', {
      failIfMajorPerformanceCaveat: true,
    })
  })
})

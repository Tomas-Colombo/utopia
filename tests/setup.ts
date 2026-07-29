import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest.config.mts does not set `test.globals: true`, so
// @testing-library/react cannot auto-detect a global `afterEach` to wire its
// own cleanup. Without this, DOM trees from one test leak into the next
// (duplicate elements, stale `data-theme` attributes).
afterEach(() => {
  cleanup()
})

// jsdom does not implement `window.matchMedia`. Components that read a media
// query on mount (e.g. Skeleton's `prefers-reduced-motion` check) would throw
// in any test that doesn't render them directly. Provide a safe default
// ("no preference matches") here; individual test files may still override
// `window.matchMedia` with `Object.defineProperty` for a specific assertion
// (see Skeleton.test.tsx), since that overrides this configurable default.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
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

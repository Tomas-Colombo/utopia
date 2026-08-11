'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into `document.body`, outside the React tree position.
 *
 * Overlays must not stay nested where they are declared: an ancestor with
 * `transform`, `filter`, `backdrop-filter`, `contain` or `will-change`
 * becomes the containing block for `position: fixed` descendants, so a
 * `fixed inset-0` backdrop would size itself to that ancestor instead of the
 * viewport (this is what clipped modals opened from the `Topbar`, which uses
 * `backdrop-blur`). Portalling to `body` also lifts the overlay out of any
 * ancestor stacking context, so its `z-50` is compared against the page
 * rather than against the ancestor's siblings.
 *
 * Rendering is deferred to the client because `document` does not exist
 * during SSR.
 */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!mounted) return null
  return createPortal(children, document.body)
}

/**
 * "Is there a DOM yet?", expressed as a store rather than the older
 * `useState(false)` + `useEffect(() => setMounted(true))` pair.
 *
 * The two produce the same two-phase render, but this one says what it means:
 * the answer comes from outside React (the environment), it differs between
 * server and client by definition, and React itself schedules the re-render
 * once hydration hands control to the client. Same idiom as ThemeProvider.
 */
function subscribe() {
  // Nothing to listen to: a document never stops existing.
  return () => {}
}

const getSnapshot = () => true
const getServerSnapshot = () => false

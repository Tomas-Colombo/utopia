'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  return createPortal(children, document.body)
}

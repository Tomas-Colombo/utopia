'use client'

import dynamic from 'next/dynamic'
import { useState, useSyncExternalStore } from 'react'
import { detectBackdropTier, type BackdropTier } from './deviceCapability'

/**
 * Decorative backdrop for the auth routes, built as progressive enhancement.
 *
 * The static gradient layer is the BASE: it renders on the server, costs zero
 * JavaScript, follows the theme tokens, and is what every visitor gets. The
 * WebGL hills are an optional layer painted on top, and only when the device
 * proves it can carry them — first through `detectBackdropTier()`, then
 * through the runtime FPS watchdog inside `HillsCanvas`.
 *
 * Because the login card itself is opaque (`bg-card`), nothing here can affect
 * the contrast of the form. The backdrop is purely behind it.
 */

// Lazy by construction: three.js lives in this chunk, so a device that never
// renders HillsCanvas never downloads it.
const HillsCanvas = dynamic(() => import('./HillsCanvas').then((m) => m.HillsCanvas), {
  ssr: false,
})

/**
 * The capability probe is a client-only fact, which is exactly what
 * `useSyncExternalStore` is for: the server snapshot is 'none' (static
 * backdrop in the HTML), the client snapshot is the real answer. Doing it this
 * way avoids a set-state-in-effect round trip.
 *
 * The result MUST be cached — `getSnapshot` runs on every render and has to be
 * referentially stable, and the probe allocates a real WebGL context.
 */
let cachedTier: BackdropTier | null = null

function getClientTier(): BackdropTier {
  cachedTier ??= detectBackdropTier()
  return cachedTier
}

/** Hardware capability never changes mid-session; nothing to subscribe to. */
const subscribe = () => () => {}
const getServerTier = (): BackdropTier => 'none'

type Status = 'mounting' | 'live' | 'failed'

export function AuthBackdrop() {
  const tier = useSyncExternalStore(subscribe, getClientTier, getServerTier)
  const [status, setStatus] = useState<Status>('mounting')

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      // Inline because these are layered `color-mix()` gradients over runtime
      // theme variables — expressing that as Tailwind arbitrary values would be
      // unreadable, and it re-tints automatically when --dim changes.
      style={{
        background: [
          'radial-gradient(120% 78% at 50% 104%, color-mix(in oklab, var(--dim) 24%, transparent), transparent 62%)',
          'radial-gradient(76% 46% at 18% 98%, color-mix(in oklab, var(--dim) 17%, transparent), transparent 58%)',
          'radial-gradient(88% 52% at 82% 96%, color-mix(in oklab, var(--dim) 14%, transparent), transparent 58%)',
        ].join(', '),
      }}
    >
      {/* Inline rather than hoisted to a boolean so `tier` narrows to ShaderTier. */}
      {tier !== 'none' && status !== 'failed' && (
        <div
          className="h-full w-full transition-opacity duration-700 ease-out motion-reduce:transition-none"
          style={{ opacity: status === 'live' ? 1 : 0 }}
        >
          <HillsCanvas
            tier={tier}
            onReady={() => setStatus('live')}
            onDegraded={() => setStatus('failed')}
          />
        </div>
      )}
    </div>
  )
}

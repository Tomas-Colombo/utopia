import { AuthBackdrop } from './backdrop/AuthBackdrop'

/**
 * Minimal auth-only layout (Slice 7, design §5). `ThemeProvider`/`ThemeToggle`
 * already wrap every route from the root layout (`app/layout.tsx`), so the
 * toggle stays available here without any extra wiring.
 *
 * The layout no longer draws a card: each route owns its own surface. Login
 * floats directly on the backdrop; `settings` keeps a panel, because a dense
 * settings view still needs something to sit on.
 *
 * `AuthBackdrop` is pure decoration behind everything — a static themed
 * gradient for every visitor, animated WebGL hills only where the device
 * proves it can render them.
 *
 * The `z-10` here is load-bearing: it makes this wrapper a stacking context,
 * so a route can park a negative-z scrim behind its own content without
 * falling behind the backdrop.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-bg px-4 py-12">
      <AuthBackdrop />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  )
}

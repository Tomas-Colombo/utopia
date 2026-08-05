/**
 * Renders a synchronous inline `<script>` without tripping React's development
 * warning ("Encountered a script tag while rendering React component").
 *
 * The type flips per environment, which is the whole trick (Next.js guide,
 * "How to prevent flash before hydration"):
 *
 * - On the server it is `text/javascript`, so the browser executes it while
 *   parsing the HTML — before the first paint, which is the entire point.
 * - On the client it is `text/plain`, so React never tries to run a script it
 *   produced itself. Scripts inserted through DOM updates do not execute
 *   anyway; marking it inert makes that explicit instead of a silent no-op.
 *
 * `suppressHydrationWarning` covers the resulting type mismatch.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

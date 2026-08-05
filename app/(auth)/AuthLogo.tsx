/**
 * Brand mark sitting above the auth forms.
 *
 * Deliberately understated: the animated backdrop already carries the screen,
 * so the mark is dialled back through `--logo-auth` rather than competing with
 * the form. That token is themed — brushed chrome is invisible on a light
 * surface, so light mode darkens it into pewter instead of just fading it.
 *
 * To swap in the full "Utopía" wordmark, drop the transparent PNG in /public
 * and change SRC below. The asset MUST have a real alpha channel; a mark on a
 * baked black background would show as a rectangle over the backdrop.
 */
const SRC = '/logo-u.png'

export function AuthLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand mark, same rationale as components/shell/Logo.tsx
    <img
      src={SRC}
      alt="Utopía"
      className="h-20 w-auto shrink-0 select-none object-contain sm:h-24"
      style={{ filter: 'var(--logo-auth)' }}
    />
  )
}

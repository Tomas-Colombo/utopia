/**
 * Utopía mark.
 *
 * `compact` renders the standalone "u" emblem used across the app shell — the
 * brand's brushed-metal glyph on a transparent background, so it sits directly
 * on the dark rail without a pill.
 *
 * Without `compact` it renders the full "Utopía" wordmark inside its chrome
 * pill, taken verbatim from the design system's sidebar header. Its gradients
 * are hard-coded hex rather than theme tokens on purpose: the mark reads as a
 * physical metal badge and must look identical in light and dark, exactly like
 * the rail it sits on.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    // The brushed-metal "u" emblem lives as a transparent PNG in /public so the
    // rendered metal (bevels, reflections) stays pixel-identical to the brand
    // asset — a hand-drawn SVG could not reproduce that finish.
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static brand mark
      <img
        src="/logo-u.png"
        alt="Utopía"
        className="h-9 w-auto shrink-0 select-none object-contain"
      />
    )
  }

  return (
    <span
      aria-label="Utopía"
      role="img"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#5f5f5f] px-5 py-2"
      style={{
        background: 'linear-gradient(180deg,#5a5a5a 0%,#242424 45%,#0c0c0c 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 3px 8px rgba(0,0,0,.55)',
      }}
    >
      <span
        aria-hidden
        className="font-display italic tracking-[-0.03em]"
        style={{
          fontSize: '21px',
          lineHeight: 1.15,
          background:
            'linear-gradient(180deg,#ffffff 0%,#eaeaea 42%,#8c8c8c 53%,#f4f4f4 92%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Utopía
      </span>
    </span>
  )
}

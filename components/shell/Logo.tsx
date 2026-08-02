/**
 * Utopía wordmark — a chrome pill with a brushed-metal gradient fill on the
 * lettering, taken verbatim from the design system's sidebar header.
 *
 * The gradients are hard-coded hex rather than theme tokens on purpose: the
 * mark reads as a physical metal badge and must look identical in light and
 * dark, exactly like the rail it sits on.
 *
 * `compact` renders the single-glyph version used when the rail is collapsed.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Utopía"
      role="img"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[#5f5f5f] ${
        compact ? 'h-9 w-9' : 'px-5 py-2'
      }`}
      style={{
        background: 'linear-gradient(180deg,#5a5a5a 0%,#242424 45%,#0c0c0c 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 3px 8px rgba(0,0,0,.55)',
      }}
    >
      <span
        aria-hidden
        className="font-display italic tracking-[-0.03em]"
        style={{
          fontSize: compact ? '15px' : '21px',
          lineHeight: 1.15,
          background:
            'linear-gradient(180deg,#ffffff 0%,#eaeaea 42%,#8c8c8c 53%,#f4f4f4 92%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {compact ? 'U' : 'Utopía'}
      </span>
    </span>
  )
}

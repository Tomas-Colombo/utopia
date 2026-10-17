import type { ReactNode } from 'react'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  ariaLabel?: string
}

// Tinted background + the matching ink token, never colour alone: success also
// carries a 7px dot and every non-neutral variant a sr-only prefix below. Each
// pair is measured by the contrast suite (tests/a11y) in both themes.
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: 'border border-border-2 bg-card-2 text-text',
  warning: 'bg-warn-bg text-warn-ink',
  danger: 'bg-alerta-bg text-alerta-ink',
  neutral: 'bg-card-3 text-muted',
  info: 'bg-card-4 text-text',
}

// Variants that convey meaning beyond the visible label MUST NOT rely on
// color alone (REQ-DS spec §5 accessibility, design §8.7 "never color-only").
// A sr-only text prefix announces the semantic to screen readers even when
// the visible label itself is neutral copy (e.g. "Alice" on a danger row).
const SEMANTIC_PREFIX: Partial<Record<BadgeVariant, string>> = {
  danger: 'Danger:',
  warning: 'Warning:',
  success: 'Success:',
}

/**
 * Small pill status indicator (REQ-DS-10 dependency). Server Component —
 * no state or event handlers needed.
 */
export function Badge({ children, variant = 'neutral', ariaLabel }: BadgeProps) {
  const prefix = SEMANTIC_PREFIX[variant]

  return (
    <span
      data-variant={variant}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.06em] ${VARIANT_CLASS[variant]}`}
    >
      {variant === 'success' && (
        <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-ok" />
      )}
      {prefix && <span className="sr-only">{prefix}</span>}
      {children}
    </span>
  )
}

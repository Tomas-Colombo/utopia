import type { ReactNode } from 'react'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  ariaLabel?: string
}

// Solid variant background + `text-sidebar` (the one token that stays fixed
// near-black in BOTH themes, REQ-DS-07) — verified ≥4.5:1 AA in light AND
// dark theme. Colored text on a neutral card background (the first attempt)
// FAILED AA in light theme for success/warning/danger (~3.0-3.7:1, computed
// against both --bg and --card-3); `terracota`/`pinkStrong`/`success` as
// TEXT are only AA-safe on the DARK bg they were raised for (design §8.3),
// not on light backgrounds. Solid-bg + near-black text sidesteps that
// entirely (REQ-DS-04).
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: 'bg-success text-sidebar',
  warning: 'bg-terracota text-sidebar',
  danger: 'bg-alerta-ink text-sidebar',
  neutral: 'bg-card-3 text-muted',
  info: 'bg-accent-pink text-sidebar',
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs uppercase ${VARIANT_CLASS[variant]}`}
    >
      {prefix && <span className="sr-only">{prefix}</span>}
      {children}
    </span>
  )
}

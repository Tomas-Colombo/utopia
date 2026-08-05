import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'neutral' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

// Design system v2 button hierarchy:
//   primary  — the accent. Reserved for the action OF THE DAY (sell, spend).
//              Rosa in light, platinum in dark — `--rosa` carries both.
//   neutral  — ink block. Everything else that commits something.
//   secondary/ghost — outline and bare, for escape hatches.
//   danger   — the alert channel, which stays pink in every theme.
//
// The `#131312` on the accent is the design's own literal, not a token: it must
// stay near-black in BOTH themes because `--rosa` is light in both. Same AA
// rationale as Badge/ConfirmDialog (REQ-DS-04). Ghost/secondary use
// text-ink/text-muted because they sit on theme-aware neutral backgrounds.
//
// `danger` cannot use a literal foreground the way `primary` does: --alerta-ink
// is a DARK pink in light mode and a LIGHT pink in dark mode, so the readable
// text flips with the theme. That is exactly what --alerta-on carries.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-rosa text-[#131312] font-bold hover:brightness-95 focus-visible:ring-rosa-ink',
  neutral: 'bg-ink text-bg hover:opacity-90 focus-visible:ring-rosa',
  secondary: 'border border-line-2 bg-transparent text-muted hover:bg-hover hover:text-ink focus-visible:ring-rosa',
  ghost: 'text-ink hover:bg-hover focus-visible:ring-rosa',
  danger: 'bg-alerta-ink text-alerta-on hover:opacity-90 focus-visible:ring-alerta-ink',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-[13.5px] px-5 py-2.5',
  lg: 'text-base px-6 py-3',
}

/**
 * Base button primitive (REQ-DS-05 keyboard-first + focus ring).
 * `type="button"` by default — callers pass `type="submit"` explicitly
 * to opt into form submission (avoids the classic "unexpected submit"
 * bug when a button sits inside a `<form>`).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // eslint-disable-next-line react/button-has-type
      type={type}
      data-variant={variant}
      data-size={size}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

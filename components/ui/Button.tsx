import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

// text-sidebar on colored backgrounds — same AA rationale as Badge/ConfirmDialog
// (REQ-DS-04). Ghost/secondary use text-text/text-muted because they sit on
// theme-aware neutral backgrounds.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-pink text-sidebar hover:bg-pink-strong focus-visible:ring-pink-strong',
  secondary: 'border border-border bg-card text-text hover:bg-card-2 focus-visible:ring-accent-pink',
  ghost: 'text-text hover:bg-card-2 focus-visible:ring-accent-pink',
  danger: 'bg-pink-strong text-sidebar hover:opacity-90 focus-visible:ring-pink-strong',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
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

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type IconButtonSize = 'sm' | 'md'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button has no other accessible name. */
  'aria-label': string
  size?: IconButtonSize
  children: ReactNode
}

const SIZE_CLASS: Record<IconButtonSize, string> = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
}

/**
 * Square, icon-only button (✕, ×, chevrons). Same `type="button"` default
 * as `Button`, so it never submits a surrounding form by accident.
 */
export function IconButton({
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      data-size={size}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50 ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

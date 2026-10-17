'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * Native checkbox wearing the ink accent. Native on purpose: keyboard,
 * form submission and the indeterminate state come for free. `forwardRef`
 * so callers can set `indeterminate` or focus it.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={`h-4 w-4 shrink-0 cursor-pointer rounded-[3px] accent-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
})

'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/**
 * Text input primitive. `forwardRef` so react-hook-form / uncontrolled
 * forms can attach refs. Visual invalid state via `aria-invalid` +
 * `data-invalid` (no color-only signal per REQ-DS §accessibility).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid, 'aria-invalid': ariaInvalid, ...rest },
  ref,
) {
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
  return (
    <input
      ref={ref}
      aria-invalid={isInvalid || undefined}
      data-invalid={isInvalid || undefined}
      className={`w-full rounded-md border border-line-2 bg-panel px-3 py-2 text-[13.5px] text-ink transition-colors placeholder:text-dim hover:border-rosa focus:outline-none focus-visible:border-rosa focus-visible:ring-2 focus-visible:ring-rosa-bg disabled:opacity-50 aria-[invalid=true]:border-rosa-ink ${className}`}
      {...rest}
    />
  )
})

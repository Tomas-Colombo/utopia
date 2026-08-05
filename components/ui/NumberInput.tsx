'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
  invalid?: boolean
  /** min/max/step map straight to native `<input type="number">` props. */
}

/**
 * Numeric input with `inputMode="decimal"` (better mobile keypad) and
 * native `type="number"` for browser validation. Callers should still
 * validate on the server — this only helps the UX.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ className = '', invalid, 'aria-invalid': ariaInvalid, ...rest }, ref) {
    const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
    return (
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        aria-invalid={isInvalid || undefined}
        data-invalid={isInvalid || undefined}
        className={`w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-muted-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink disabled:opacity-50 aria-[invalid=true]:border-alerta-ink ${className}`}
        {...rest}
      />
    )
  },
)

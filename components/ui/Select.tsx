'use client'

import { forwardRef, type SelectHTMLAttributes } from 'react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

/**
 * Dropdown primitive: a native `<select>` wearing the design system.
 *
 * The base look (chrome, chevron, option/optgroup colours, focus ring) lives
 * in `app/globals.css` so that EVERY `<select>` in the app is styled, not just
 * the ones routed through this component. What this adds on top is the
 * invalid state and a single import point for new call sites.
 *
 * Native on purpose. A JS listbox would let us paint the popup itself, but it
 * costs mobile's OS picker, form autofill, and type-ahead. When a dropdown
 * genuinely needs search over many options, reach for `SearchableSelect`
 * instead — that is the deliberate exception, not the default.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', invalid, 'aria-invalid': ariaInvalid, children, ...rest },
  ref,
) {
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
  // Full width unless the caller sets a width itself: appending `w-auto` after
  // `w-full` would race on stylesheet order, not on class order.
  const width = /(^|\s)w-/.test(className) ? '' : 'w-full '
  return (
    <select
      ref={ref}
      aria-invalid={isInvalid || undefined}
      data-invalid={isInvalid || undefined}
      className={`${width}${className}`}
      {...rest}
    >
      {children}
    </select>
  )
})

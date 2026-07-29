'use client'

import { forwardRef, type TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = '', invalid, 'aria-invalid': ariaInvalid, ...rest }, ref) {
    const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
    return (
      <textarea
        ref={ref}
        aria-invalid={isInvalid || undefined}
        data-invalid={isInvalid || undefined}
        className={`w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-muted-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink disabled:opacity-50 aria-[invalid=true]:border-pink-strong ${className}`}
        {...rest}
      />
    )
  },
)

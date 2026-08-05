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
        className={`w-full rounded-md border border-control-line bg-control px-3 py-2 text-[13.5px] text-ink transition-colors placeholder:text-dim hover:border-rosa focus:outline-none focus-visible:border-rosa focus-visible:ring-2 focus-visible:ring-rosa-bg disabled:opacity-50 aria-[invalid=true]:border-alerta-ink ${className}`}
        {...rest}
      />
    )
  },
)

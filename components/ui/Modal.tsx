'use client'

import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Optional footer slot (usually a Cancel/Save button pair). */
  footer?: ReactNode
  /** `md` (default) or `lg` for wider content (forms with several columns). */
  size?: 'md' | 'lg' | 'xl'
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SIZE_CLASS = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

/**
 * General-purpose modal for forms and multi-line dialogs. Shares the same
 * manual focus-trap + Esc-to-close mechanics as `ConfirmDialog` (design
 * note: jsdom has been flaky with native `<dialog>`).
 *
 * NOT for destructive confirmations — use `ConfirmDialog` for those; it
 * enforces primary-button-first focus and has a `danger` variant.
 */
export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus first focusable element inside the dialog (usually the first input).
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    first?.focus()
  }, [open])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey && (active === first || !focusable.includes(active as HTMLElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={`w-full ${SIZE_CLASS[size]} rounded-md border border-border bg-card shadow-lg`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id={titleId} className="font-display text-lg text-text">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Portal } from './Portal'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** danger variant emphasizes a destructive confirm action. */
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal confirmation gate for destructive actions (REQ-DS-14). A manual
 * `role="dialog"` + focus trap is used instead of the native `<dialog>`
 * element — `<dialog>` support in jsdom/Testing Library has historically
 * been flaky (design instructions), so the trap is implemented directly via
 * `querySelectorAll` over focusable descendants.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const dialogRef = useRef<HTMLDivElement>(null)

  // Initial focus lands on the confirm button every time the dialog opens.
  // This is a callback ref rather than an `[open]` effect because the dialog
  // renders through a client-only Portal and therefore attaches one commit
  // after `open` flips — an effect would fire while the node is still null.
  const focusOnAttach = useCallback((node: HTMLButtonElement | null) => {
    node?.focus()
  }, [])

  function getFocusableElements(): HTMLElement[] {
    if (!dialogRef.current) return []
    return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = getFocusableElements()
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !focusable.includes(active as HTMLElement)) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  if (!open) return null

  return (
    <Portal>
      <div
        data-testid="confirm-dialog-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4"
        onClick={onCancel}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleKeyDown}
          // max-h + scroll: en una pantalla baja (o con una descripción larga)
          // el diálogo se recortaba y los botones quedaban fuera de vista, sin
          // forma de llegar a ellos. Mismo guard que `Modal`.
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-md border border-border bg-card p-6 shadow-lg"
        >
          <h2 id={titleId} className="font-display text-lg text-text">
            {title}
          </h2>
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm text-text"
            >
              {cancelLabel}
            </button>
            {/* text-sidebar (fixed near-black in both themes) — text-text/text-bg
                flip to a LIGHT color in dark theme and fail AA against these
                light accent backgrounds (verified via WCAG contrast math). */}
            <button
              ref={focusOnAttach}
              type="button"
              data-variant={variant}
              onClick={onConfirm}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-sidebar ${
                variant === 'danger' ? 'bg-alerta-ink' : 'bg-accent-pink'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

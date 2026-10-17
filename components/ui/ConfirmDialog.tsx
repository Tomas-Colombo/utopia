'use client'

import {
  useCallback,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { Portal } from './Portal'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** danger variant emphasizes a destructive confirm action. */
  variant?: 'default' | 'danger'
  /**
   * Optional slot between the description and the buttons, for a confirm that
   * also collects something — e.g. an optional reason recorded with the
   * action. Inputs rendered here join the focus trap on their own, because
   * `FOCUSABLE_SELECTOR` already covers them.
   */
  children?: ReactNode
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
  children,
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4 backdrop-blur-[2px]"
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
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-line bg-card p-6 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] motion-safe:animate-[fadeUp_0.18s_ease-out]"
        >
          <h2 id={titleId} className="font-display text-lg text-text">
            {title}
          </h2>
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-line-2 px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-y-px"
            >
              {cancelLabel}
            </button>
            {/* Both pairs flip together between themes (block/block-ink,
                alerta-ink/alerta-on), so the contrast holds in light and dark. */}
            <button
              ref={focusOnAttach}
              type="button"
              data-variant={variant}
              onClick={onConfirm}
              className={`rounded-md px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-y-px ${
                variant === 'danger' ? 'bg-alerta-ink text-alerta-on' : 'bg-block text-block-ink'
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

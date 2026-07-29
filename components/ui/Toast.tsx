'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  /** Auto-dismiss after N ms. 0 = sticky (user must close). Default 4000. */
  duration?: number
}

interface ToastAPI {
  show: (t: Omit<ToastItem, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastAPI | null>(null)

/**
 * Toast provider — wrap the app shell once (or a subtree) with this.
 * Consumers call `useToast().success('Guardado')`.
 *
 * Container uses `role="status"` + `aria-live="polite"` so screen readers
 * announce new toasts without stealing focus (destructive/error variants
 * use `assertive` to interrupt).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback<ToastAPI['show']>((t) => {
    counterRef.current += 1
    const id = `t-${counterRef.current}`
    setItems((prev) => [...prev, { ...t, id }])
  }, [])

  const api = useMemo<ToastAPI>(
    () => ({
      show,
      success: (title, description) => show({ variant: 'success', title, description }),
      error: (title, description) => show({ variant: 'error', title, description, duration: 6000 }),
      info: (title, description) => show({ variant: 'info', title, description }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <ToastItemView key={t.id} item={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Hook to trigger toasts from client components. Throws if used outside
 * `<ToastProvider>` — fail-fast so misuse is caught in dev, not silently.
 */
export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: 'bg-success text-sidebar',
  error: 'bg-pink-strong text-sidebar',
  info: 'bg-accent-pink text-sidebar',
}

const SEMANTIC_PREFIX: Record<ToastVariant, string> = {
  success: 'Éxito:',
  error: 'Error:',
  info: 'Info:',
}

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const duration = item.duration ?? 4000
  useEffect(() => {
    if (duration <= 0) return
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [duration, onDismiss])

  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto flex min-w-[260px] max-w-sm items-start gap-3 rounded-md px-4 py-3 text-sm shadow-lg ${VARIANT_CLASS[item.variant]}`}
    >
      <div className="flex-1">
        <span className="sr-only">{SEMANTIC_PREFIX[item.variant]}</span>
        <div className="font-semibold">{item.title}</div>
        {item.description && (
          <div className="mt-0.5 text-xs opacity-90">{item.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="rounded p-0.5 text-sidebar/80 hover:text-sidebar focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}

import type { ReactNode } from 'react'

export interface FieldProps {
  /** Must match the `id` of the input rendered as `children`. */
  htmlFor: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

/**
 * Field wrapper: label + input slot + hint/error message.
 * Uses `aria-describedby` so screen readers announce both hint and error
 * along with the input's own label.
 *
 * Callers are responsible for wiring `aria-invalid` on the input when
 * `error` is present — this component only renders the visual + text
 * feedback.
 */
export function Field({ htmlFor, label, hint, error, required, children }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
        {required && (
          <span aria-label="required" className="ml-0.5 text-alerta-ink">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-alerta-ink">
          {error}
        </p>
      )}
    </div>
  )
}

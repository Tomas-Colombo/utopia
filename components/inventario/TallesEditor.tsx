'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

/**
 * Editor dinámico de talles (chips). Se tipea un talle y se agrega con
 * Enter o el botón. Dedupe case-insensitive. Reutilizable en categorías,
 * producto e ingreso.
 */
export function TallesEditor({
  id,
  value,
  onChange,
  placeholder = 'Ej: S, M, L, XL, 40, 42…',
  disabled,
}: {
  /**
   * Id of the draft input. Callers that wrap this control in a `<Field>` MUST
   * pass the same value as the field's `htmlFor`; without it the label points
   * at nothing and the control has no accessible name.
   */
  id?: string
  value: string[]
  onChange: (talles: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  function agregar() {
    const v = draft.trim()
    if (!v) return
    if (value.some((t) => t.toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...value, v])
    setDraft('')
  }

  function quitar(t: string) {
    onChange(value.filter((x) => x !== t))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      agregar()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button type="button" variant="secondary" onClick={agregar} disabled={disabled || !draft.trim()}>
          Agregar
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-2">Sin talles. Los productos de esta categoría se cargarán sin talle.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {value.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card-2 px-3 py-1 text-sm"
            >
              {t}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => quitar(t)}
                  aria-label={`Quitar talle ${t}`}
                  className="text-muted hover:text-text"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

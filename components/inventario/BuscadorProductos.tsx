'use client'

import { useState, type ReactNode } from 'react'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'

export interface SugerenciaProducto {
  /** Stable key + payload id (id_producto or id_item depending on the caller). */
  id: string
  nombre: string
  sku?: string | null
  /** Right-aligned muted text: stock, QR, talle, etc. */
  detalle?: string
}

/**
 * Buscador con sugerencias en vivo, extraído del carrito de venta
 * (`ventas/nueva`) para reusar el MISMO comportamiento en inventario y
 * consignaciones: el input acepta nombre, SKU o QR; mientras se tipea se
 * muestra un desplegable de coincidencias por nombre/SKU navegable con teclado.
 *
 * Presentacional: el filtrado de `sugerencias` y la resolución (`onElegir` /
 * `onSubmit`) las decide cada pantalla según su semántica.
 */
export function BuscadorProductos({
  id,
  label,
  hint,
  error,
  placeholder,
  value,
  onChange,
  sugerencias,
  onElegir,
  onSubmit,
  disabled = false,
  autoFocus = false,
  actions,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  sugerencias: SugerenciaProducto[]
  onElegir: (s: SugerenciaProducto) => void
  /** Enter/submit sin una sugerencia elegida: texto libre (QR/SKU/nombre). */
  onSubmit: (texto: string) => void
  disabled?: boolean
  autoFocus?: boolean
  /** Botones a la derecha del input (Agregar, Cámara, Aplicar, etc.). */
  actions?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [resaltado, setResaltado] = useState(0)

  const hayLista = open && sugerencias.length > 0
  const activoIdx = Math.min(resaltado, Math.max(0, sugerencias.length - 1))

  // Con sugerencias abiertas elegimos la resaltada — NUNCA caemos al path de
  // texto libre, para no resolver por código un ítem equivocado.
  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (hayLista) {
      onElegir(sugerencias[activoIdx])
      setOpen(false)
      return
    }
    const texto = value.trim()
    if (texto) onSubmit(texto)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hayLista) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado((i) => Math.min(sugerencias.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((i) => Math.max(0, i - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Field htmlFor={id} label={label} error={error} hint={hint}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={id}
              autoFocus={autoFocus}
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                setOpen(true)
                setResaltado(0)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              invalid={!!error}
              disabled={disabled}
              role="combobox"
              aria-expanded={hayLista}
              aria-autocomplete="list"
            />
            {hayLista && (
              <ul
                role="listbox"
                className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card-2 shadow"
              >
                {sugerencias.map((s, i) => {
                  const activo = i === activoIdx
                  return (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={activo}
                      // onMouseDown para seleccionar antes del blur del input.
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onElegir(s)
                        setOpen(false)
                      }}
                      onMouseEnter={() => setResaltado(i)}
                      className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                        activo ? 'bg-pink-bg text-text' : 'text-text'
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {s.nombre}
                        {s.sku ? (
                          <span className="ml-2 font-mono text-xs text-muted">{s.sku}</span>
                        ) : null}
                      </span>
                      {s.detalle && (
                        <span className="shrink-0 font-mono text-xs text-muted">{s.detalle}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {actions}
        </div>
      </Field>
    </form>
  )
}

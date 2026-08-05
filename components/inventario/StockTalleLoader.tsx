'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { MAX_UNIDADES_LINEA } from '@/lib/inventario/limites'

export type LineaTalle = { talle: string | null; cantidad: number }

const SIN_TALLE = '__sin_talle__'

// Mismo tope que revalidan las Server Actions; se re-exporta para que los
// formularios que ya usan este control no cambien su import.
export { MAX_UNIDADES_LINEA }

/**
 * Normaliza lo que se tipea en un input de unidades: entero, no negativo y
 * bajo el tope. El atributo `max` nativo sólo frena las flechitas del spinner
 * — tipeando o pegando entra cualquier cosa.
 */
export function clampUnidades(val: string): string {
  if (val.trim() === '') return ''
  const n = Number(val)
  if (!Number.isFinite(n)) return ''
  return String(Math.min(Math.max(Math.floor(n), 0), MAX_UNIDADES_LINEA))
}

/**
 * Carga dinámica de stock por talle: se elige un talle (o "sin talle"),
 * una cantidad, y se agrega. Se acumula por talle (merge).
 *
 * `max` (opcional): tope total. En el import de remito, la cantidad de la
 * línea manda — no se pueden asignar más unidades que esa cantidad. Sin
 * `max` (alta de producto), el total es libre y lo define la suma.
 */
export function StockTalleLoader({
  talles,
  value,
  onChange,
  disabled,
  max,
}: {
  talles: string[]
  value: LineaTalle[]
  onChange: (lineas: LineaTalle[]) => void
  disabled?: boolean
  max?: number
}) {
  // Por defecto arranca en "sin talle"; el usuario elige un talle si lo necesita.
  const [talle, setTalle] = useState<string>(SIN_TALLE)
  const [cantidad, setCantidad] = useState('1')

  const total = value.reduce((a, l) => a + l.cantidad, 0)
  const conTope = max != null
  const restante = conTope ? Math.max(0, max - total) : Infinity
  const sinCupo = conTope && restante <= 0
  // Tope efectivo del input: el cupo de la línea si lo hay, siempre bajo el
  // máximo duro de unidades.
  const maxInput = conTope ? Math.min(restante, MAX_UNIDADES_LINEA) : MAX_UNIDADES_LINEA

  function agregar() {
    let cant = Math.floor(Number(cantidad || 0))
    if (!Number.isFinite(cant) || cant <= 0) return
    cant = Math.min(cant, MAX_UNIDADES_LINEA)
    if (conTope) cant = Math.min(cant, restante)
    if (cant <= 0) return
    const t = talle === SIN_TALLE ? null : talle
    const idx = value.findIndex((l) => l.talle === t)
    if (idx >= 0) {
      // El merge también se clampea: acumular sobre un talle existente no
      // puede sortear el tope.
      onChange(
        value.map((l, i) =>
          i === idx ? { ...l, cantidad: Math.min(l.cantidad + cant, MAX_UNIDADES_LINEA) } : l,
        ),
      )
    } else {
      onChange([...value, { talle: t, cantidad: cant }])
    }
    setCantidad('1')
  }

  function quitar(t: string | null) {
    onChange(value.filter((l) => l.talle !== t))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <NumberInput
          min={1}
          max={maxInput}
          step={1}
          value={cantidad}
          onChange={(e) => setCantidad(clampUnidades(e.target.value))}
          disabled={disabled || sinCupo}
          className="w-20"
          aria-label="Cantidad"
        />
        <select
          value={talle}
          onChange={(e) => setTalle(e.target.value)}
          disabled={disabled || sinCupo}
          aria-label="Talle"
          className=""
        >
          {talles.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={SIN_TALLE}>Sin talle</option>
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={agregar} disabled={disabled || sinCupo}>
          Agregar
        </Button>
        {conTope ? (
          <span className="text-xs text-muted">
            {total}/{max} asignados
            {restante > 0 && ` · faltan ${restante}`}
          </span>
        ) : (
          total > 0 && <span className="text-xs text-muted">Total: {total}</span>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => (
            <span
              key={l.talle ?? SIN_TALLE}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs"
            >
              <b className="font-mono">{l.cantidad}</b>
              <span className="text-muted-2">×</span>
              {l.talle ?? 'sin talle'}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => quitar(l.talle)}
                  aria-label={`Quitar ${l.talle ?? 'sin talle'}`}
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

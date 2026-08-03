'use client'

import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'

/** Un talle con stock libre, tal como lo devuelve `elegir-talle`. */
export interface TalleOpcion {
  talle: string
  disponibles: number
}

/** Clave interna de la fila "sin talle" dentro de `cantidades`. */
export const SIN_TALLE_KEY = '__sin__'

export interface SelectorTalle {
  idProducto: string
  productoNombre: string
  /** null = agregar líneas nuevas; si tiene valor, es la key del grupo a reestructurar. */
  grupoKey: string | null
  opciones: TalleOpcion[]
  /** Unidades disponibles SIN talle asignado — se ofrecen aparte. */
  sinTalle: number
  /** Cantidad por talle elegida por el operador. Clave = talle o '__sin__'. */
  cantidades: Record<string, number>
}

/**
 * Selector multi-talle. El operador ve TODOS los talles del producto con su
 * stock libre y un input de cantidad por talle. Puede combinar (ej. 1 M + 1 S)
 * y confirmar todo en una sola acción. En modo "cambiar" arranca precargado
 * con la distribución actual del grupo, así se reestructura sin tener que
 * reescribir desde cero.
 *
 * Compartido entre el carrito de venta y el alta de reserva: el gate de
 * desambiguación de talle es del server (`elegir-talle`), y ambos flujos lo
 * resuelven con la misma UI.
 */
export function SelectorTalleMulti({
  selector,
  disabled,
  onChangeCantidad,
  onConfirm,
  onCancel,
}: {
  selector: SelectorTalle
  disabled: boolean
  onChangeCantidad: (key: string, nueva: number, max: number) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const filas: Array<{ key: string; label: string; max: number }> = [
    ...selector.opciones.map((o) => ({
      key: o.talle,
      label: `Talle ${o.talle}`,
      max: o.disponibles,
    })),
  ]
  if (selector.sinTalle > 0) {
    filas.push({ key: SIN_TALLE_KEY, label: 'Sin talle', max: selector.sinTalle })
  }
  const totalElegido = Object.values(selector.cantidades).reduce((a, b) => a + b, 0)
  const esCambio = !!selector.grupoKey

  return (
    <div className="rounded-md border border-border bg-card-2 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="text-muted">
            {esCambio ? 'Reestructurar' : 'Elegí talle y cantidad de'}{' '}
          </span>
          <b>{selector.productoNombre}</b>
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-2">
        {filas.map((f) => {
          const cant = selector.cantidades[f.key] ?? 0
          const agotado = f.max === 0
          return (
            <FilaTalle
              key={f.key}
              label={f.label}
              max={f.max}
              cant={cant}
              disabled={disabled || agotado}
              onChange={(n) => onChangeCantidad(f.key, n, f.max)}
            />
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-xs text-muted">
          {totalElegido === 0
            ? 'Poné al menos 1 unidad en algún talle.'
            : `${totalElegido} unidad${totalElegido === 1 ? '' : 'es'} a ${esCambio ? 'dejar en el carrito' : 'agregar'}.`}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={disabled || totalElegido === 0}
          onClick={onConfirm}
        >
          {esCambio ? 'Aplicar cambio' : `Agregar ${totalElegido || ''}`.trim()}
        </Button>
      </div>
    </div>
  )
}

function FilaTalle({
  label,
  max,
  cant,
  disabled,
  onChange,
}: {
  label: string
  max: number
  cant: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <>
      <span className="text-sm">
        <span className="font-medium">{label}</span>{' '}
        <span className="text-xs text-muted">· {max} disp.</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled || cant <= 0}
        onClick={() => onChange(cant - 1)}
        aria-label={`Restar ${label}`}
      >
        −
      </Button>
      <NumberInput
        min={0}
        max={max}
        value={cant}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        aria-label={`Cantidad ${label}`}
        className="w-14 text-right"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled || cant >= max}
        onClick={() => onChange(cant + 1)}
        aria-label={`Sumar ${label}`}
      >
        +
      </Button>
    </>
  )
}

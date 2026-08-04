'use client'

import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'

/** Un talle con su stock, tal como lo devuelve `elegir-talle`. */
export interface TalleOpcion {
  talle: string
  disponibles: number
  /** Unidades del talle tomadas por una reserva activa ajena. */
  reservados?: number
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
  /** Unidades sin talle tomadas por una reserva activa ajena. */
  sinTalleReservados?: number
  /**
   * Reserva a la que se puede enganchar la venta para liberar las unidades
   * reservadas. `null`/ausente = las reservadas no son tomables (es el caso
   * del alta de reserva, donde no existe la noción de adoptar).
   */
  idReservaAdoptable?: string | null
  /** Etiqueta corta de esa reserva (cliente), para el cartel. */
  reservaLabel?: string | null
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
  // Las unidades reservadas suman al tope SÓLO si la venta puede adoptar esa
  // reserva. Si no, se muestran igual pero no se pueden tomar.
  const adopta = !!selector.idReservaAdoptable
  const filas: Array<{
    key: string
    label: string
    libres: number
    reservados: number
    max: number
  }> = selector.opciones.map((o) => {
    const reservados = o.reservados ?? 0
    return {
      key: o.talle,
      label: `Talle ${o.talle}`,
      libres: o.disponibles,
      reservados,
      max: o.disponibles + (adopta ? reservados : 0),
    }
  })
  const sinTalleReservados = selector.sinTalleReservados ?? 0
  if (selector.sinTalle > 0 || sinTalleReservados > 0) {
    filas.push({
      key: SIN_TALLE_KEY,
      label: 'Sin talle',
      libres: selector.sinTalle,
      reservados: sinTalleReservados,
      max: selector.sinTalle + (adopta ? sinTalleReservados : 0),
    })
  }
  const totalElegido = Object.values(selector.cantidades).reduce((a, b) => a + b, 0)
  const esCambio = !!selector.grupoKey
  const hayReservados = filas.some((f) => f.reservados > 0)

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

      {hayReservados && (
        <p className="rounded border border-terracota/40 bg-card px-2 py-1.5 text-xs text-terracota">
          {adopta
            ? `Hay unidades reservadas${selector.reservaLabel ? ` para ${selector.reservaLabel}` : ''}. Si las tomás, la venta queda ligada a esa reserva.`
            : 'Hay unidades reservadas por otra reserva activa: no se pueden tomar desde acá.'}
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-2">
        {filas.map((f) => {
          const cant = selector.cantidades[f.key] ?? 0
          const agotado = f.max === 0
          return (
            <FilaTalle
              key={f.key}
              label={f.label}
              libres={f.libres}
              reservados={f.reservados}
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
  libres,
  reservados,
  max,
  cant,
  disabled,
  onChange,
}: {
  label: string
  libres: number
  reservados: number
  max: number
  cant: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <>
      <span className="text-sm">
        <span className="font-medium">{label}</span>{' '}
        <span className="text-xs text-muted">· {libres} disp.</span>
        {reservados > 0 && (
          <span className="ml-1 rounded-full border border-terracota/50 bg-card px-1.5 py-0.5 text-[10px] font-medium text-terracota">
            {reservados} reservada{reservados === 1 ? '' : 's'}
          </span>
        )}
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

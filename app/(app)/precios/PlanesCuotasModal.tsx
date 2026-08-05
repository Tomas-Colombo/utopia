'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { NumberInput } from '@/components/ui/NumberInput'
import { useToast } from '@/components/ui/Toast'
import { CUOTAS_MAX, CUOTAS_MIN, type PlanCuotasRow } from '@/lib/types/precios'
import { crearPlanCuotasAction, setPlanCuotasActivoAction } from './actions'

export interface PlanesCuotasModalProps {
  open: boolean
  onClose: () => void
  planes: PlanCuotasRow[]
  /** Se dispara con la lista ya refrescada tras cada alta/baja. */
  onChange: (planes: PlanCuotasRow[]) => void
}

/**
 * Configuración de los planes de cuotas del tenant (00052). Vive acá, en
 * Precios, porque decidir en cuántas cuotas se vende es la misma decisión que
 * después cuelga un recargo: primero existe el plan, después la regla.
 *
 * Se abre desde el listado de reglas y desde el desplegable "Forma de pago"
 * del alta de regla, para no obligar a salir del formulario a medio llenar.
 *
 * La baja es lógica: las reglas de recargo y las ventas históricas siguen
 * apuntando a esa forma de pago.
 */
export function PlanesCuotasModal({ open, onClose, planes, onChange }: PlanesCuotasModalProps) {
  const toast = useToast()
  const [pending, start] = useTransition()
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState<string | null>(null)

  function agregar() {
    const n = Number(nuevo)
    if (!Number.isInteger(n) || n < CUOTAS_MIN || n > CUOTAS_MAX) {
      return setError(`Poné un número entero entre ${CUOTAS_MIN} y ${CUOTAS_MAX}`)
    }
    setError(null)
    start(async () => {
      const res = await crearPlanCuotasAction(n)
      if (!res.ok) return toast.error('No se pudo agregar', res.reason)
      onChange(res.data!.planes)
      setNuevo('')
      toast.success(`${n} cuotas disponible`)
    })
  }

  function alternar(plan: PlanCuotasRow) {
    start(async () => {
      const res = await setPlanCuotasActivoAction(plan.cuotas, !plan.activo)
      if (!res.ok) return toast.error('No se pudo actualizar', res.reason)
      onChange(res.data!.planes)
    })
  }

  return (
    <Modal open={open} title="Planes de cuotas" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          En cuántas cuotas se puede vender. El interés de cada plan se carga
          aparte, como una regla de recargo.
        </p>

        {planes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card-2 px-3 py-4 text-center text-sm text-muted">
            Todavía no hay planes cargados.
          </p>
        ) : (
          <ul className="divide-y divide-border-2 rounded-md border border-border">
            {planes.map((p) => (
              <li key={p.cuotas} className="flex items-center justify-between px-3 py-2">
                <span className={p.activo ? 'text-sm' : 'text-sm text-muted line-through'}>
                  {p.cuotas} cuotas
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => alternar(p)}
                  disabled={pending}
                >
                  {p.activo ? 'Quitar' : 'Reactivar'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="pc-nuevo" className="mb-1 block text-sm text-muted">
              Agregar plan
            </label>
            <NumberInput
              id="pc-nuevo"
              min={CUOTAS_MIN}
              max={CUOTAS_MAX}
              step="1"
              placeholder="Ej. 18"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  agregar()
                }
              }}
            />
          </div>
          <Button onClick={agregar} disabled={pending || nuevo === ''}>
            Agregar
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-alerta-ink bg-alerta-bg px-3 py-2 text-sm text-alerta-ink"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

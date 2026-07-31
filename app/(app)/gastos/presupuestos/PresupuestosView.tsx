'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { useToast } from '@/components/ui/Toast'
import { setPresupuestoAction } from '../../rendiciones/actions'

interface Cat { id: string; nombre: string; presupuesto: number | null }

/**
 * Edición inline del presupuesto mensual por categoría (RF-10).
 * `null` = sin control; vacío en el input → null.
 */
export function PresupuestosView({ initial }: { initial: Cat[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [values, setValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of initial) map[c.id] = c.presupuesto == null ? '' : String(c.presupuesto)
    return map
  })

  function save(id: string) {
    const raw = values[id]?.trim() ?? ''
    const presupuesto = raw === '' ? null : Number(raw)
    if (presupuesto != null && (!isFinite(presupuesto) || presupuesto < 0)) {
      return toast.error('Valor inválido')
    }
    start(async () => {
      const res = await setPresupuestoAction({ idCategoria: id, presupuesto })
      if (!res.ok) return toast.error('No se pudo guardar', res.reason)
      toast.success('Presupuesto actualizado')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
        Presupuesto <b>mensual</b> por categoría. Vacío = sin control. Se
        compara contra la suma de gastos del mes calendario en curso.
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Presupuesto mensual (ARS)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {initial.map((c) => (
              <tr key={c.id} className="border-b border-border-2">
                <td className="px-4 py-3 font-medium">{c.nombre}</td>
                <td className="px-4 py-3">
                  <NumberInput
                    aria-label={`Presupuesto ${c.nombre}`}
                    min={0}
                    step="0.01"
                    value={values[c.id] ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [c.id]: e.target.value }))
                    }
                    placeholder="Sin control"
                    className="max-w-xs"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => save(c.id)}
                    disabled={pending}
                  >
                    Guardar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

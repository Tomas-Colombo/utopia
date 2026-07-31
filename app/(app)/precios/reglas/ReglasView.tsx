'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  ALCANCE_LABEL,
  FORMA_PAGO_LABEL,
  TIPO_REGLA_LABEL,
  type ReglaPrecioRow,
  type TipoRegla,
} from '@/lib/types/precios'
import { bajaReglaAction } from '../actions'

const TIPO_VARIANT: Record<TipoRegla, 'success' | 'info' | 'warning'> = {
  margen: 'info',
  descuento: 'success',
  recargo: 'warning',
}

export function ReglasView({ initial }: { initial: ReglaPrecioRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [confirm, setConfirm] = useState<ReglaPrecioRow | null>(null)
  const [pending, start] = useTransition()

  function ejecutarBaja() {
    if (!confirm) return
    const r = confirm
    setConfirm(null)
    start(async () => {
      const res = await bajaReglaAction(r.id_regla)
      if (!res.ok) return toast.error('No se pudo dar de baja', res.reason)
      toast.success('Regla dada de baja')
      setRows((rs) => rs.filter((x) => x.id_regla !== r.id_regla))
      router.refresh()
    })
  }

  function fmtValor(r: ReglaPrecioRow): string {
    if (r.tipo_valor === 'porcentaje') {
      return `${(r.valor * 100).toFixed(2)}%`
    }
    return `$ ${Number(r.valor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
  }

  function fmtVigencia(r: ReglaPrecioRow): string {
    const desde = r.fecha_inicio ? new Date(r.fecha_inicio).toLocaleDateString('es-AR') : 'ahora'
    const hasta = r.fecha_hasta ? new Date(r.fecha_hasta).toLocaleDateString('es-AR') : 'indefinido'
    return `${desde} → ${hasta}`
  }

  const grupos = groupBy(rows, (r) => r.tipo_regla)

  return (
    <div className="space-y-6">
      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg mb-2">Sin reglas configuradas</p>
          <p className="text-sm text-muted mb-4">
            Creá al menos una regla de margen para poder calcular precios.
          </p>
        </div>
      )}

      {(['margen', 'descuento', 'recargo'] as TipoRegla[]).map((tipo) => {
        const grupo = grupos.get(tipo) ?? []
        if (grupo.length === 0) return null
        return (
          <section key={tipo}>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant={TIPO_VARIANT[tipo]}>{TIPO_REGLA_LABEL[tipo]}</Badge>
              <span className="text-sm text-muted">
                {grupo.length} regla{grupo.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Alcance</th>
                    <th className="px-4 py-3">Forma pago</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-right">Prioridad</th>
                    <th className="px-4 py-3">Vigencia</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((r) => (
                    <tr key={r.id_regla} className="border-b border-border-2">
                      <td className="px-4 py-3">{r.nombre}</td>
                      <td className="px-4 py-3">{ALCANCE_LABEL[r.alcance]}</td>
                      <td className="px-4 py-3">
                        {r.forma_pago ? FORMA_PAGO_LABEL[r.forma_pago] : <span className="text-muted-2">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{fmtValor(r)}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.prioridad}</td>
                      <td className="px-4 py-3 text-xs text-muted">{fmtVigencia(r)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirm(r)}
                          disabled={pending}
                        >
                          Dar de baja
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      <ConfirmDialog
        open={!!confirm}
        title="Dar de baja regla"
        description={
          confirm
            ? `"${confirm.nombre}" dejará de aplicarse. Los precios ya guardados no cambian. Si es una regla de margen, los productos afectados van a marcarse como desactualizados.`
            : ''
        }
        variant="danger"
        confirmLabel="Sí, dar de baja"
        cancelLabel="Cancelar"
        onConfirm={ejecutarBaja}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function groupBy<T, K>(arr: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of arr) {
    const k = key(item)
    const bucket = map.get(k) ?? []
    bucket.push(item)
    map.set(k, bucket)
  }
  return map
}

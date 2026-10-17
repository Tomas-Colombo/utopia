'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  ALCANCE_LABEL,
  TIPO_REGLA_LABEL,
  formaPagoLabel,
  type PlanCuotasRow,
  type ReglaPrecioRow,
  type TipoRegla,
} from '@/lib/types/precios'
import { bajaReglaAction } from '../actions'
import { PlanesCuotasModal } from '../PlanesCuotasModal'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { TableFrame, DataTable, THead, TBody, Tr, Th, Td } from '@/components/ui/TableParts'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'

const TIPO_VARIANT: Record<TipoRegla, 'success' | 'info' | 'warning'> = {
  margen: 'info',
  descuento: 'success',
  recargo: 'warning',
}

type OrdenPrioridad = 'desc' | 'asc'

/**
 * Ordena por prioridad según la dirección elegida. Desempate estable por
 * updated_at DESC (la más reciente primero), igual que el motor de precios.
 */
function ordenarPorPrioridad(
  grupo: ReglaPrecioRow[],
  orden: OrdenPrioridad,
): ReglaPrecioRow[] {
  return [...grupo].sort((a, b) => {
    if (a.prioridad !== b.prioridad) {
      return orden === 'desc' ? b.prioridad - a.prioridad : a.prioridad - b.prioridad
    }
    return b.updated_at.localeCompare(a.updated_at)
  })
}

export function ReglasView({
  initial,
  planesCuotas,
}: {
  initial: ReglaPrecioRow[]
  planesCuotas: PlanCuotasRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [confirm, setConfirm] = useState<ReglaPrecioRow | null>(null)
  const [orden, setOrden] = useState<OrdenPrioridad>('desc')
  const [pending, start] = useTransition()
  const [planes, setPlanes] = useState(planesCuotas)
  const [cuotasOpen, setCuotasOpen] = useState(false)

  function ejecutarBaja() {
    if (!confirm) return
    const r = confirm
    setConfirm(null)
    start(async () => {
      const res = await bajaReglaAction(r.id_regla)
      if (!res.ok) return toast.error('No se pudo dar de baja', mensajeDeError(res.reason))
      toast.success('Regla dada de baja')
      setRows((rs) => rs.filter((x) => x.id_regla !== r.id_regla))
      router.refresh()
    })
  }

  function fmtValor(r: ReglaPrecioRow): string {
    if (r.tipo_valor === 'porcentaje') {
      return `${(r.valor * 100).toFixed(2)}%`
    }
    return `$ ${Number(r.valor).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  }

  function fmtVigencia(r: ReglaPrecioRow): string {
    const desde = r.fecha_inicio ? new Date(r.fecha_inicio).toLocaleDateString('es-AR') : 'ahora'
    const hasta = r.fecha_hasta ? new Date(r.fecha_hasta).toLocaleDateString('es-AR') : 'indefinido'
    return `${desde} → ${hasta}`
  }

  const grupos = useMemo(() => groupBy(rows, (r) => r.tipo_regla), [rows])

  return (
    <div className="space-y-6">
      {/* Los planes de cuotas son el paso previo a un recargo por cuotas, así
          que su configuración vive donde se administran las reglas. */}
      <Card padding="none" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm text-muted">
          Planes de cuotas activos:{' '}
          {planes.some((p) => p.activo) ? (
            <b className="text-text">
              {planes
                .filter((p) => p.activo)
                .map((p) => p.cuotas)
                .join(' · ')}
            </b>
          ) : (
            <span className="text-muted">ninguno</span>
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setCuotasOpen(true)}>
          Editar cuotas
        </Button>
      </Card>

      {rows.length === 0 && (
        <Card padding="none" className="border-dashed p-10 text-center">
          <p className="font-display text-lg mb-2">Sin reglas configuradas</p>
          <p className="text-sm text-muted mb-4">
            Creá al menos una regla de margen para poder calcular precios.
          </p>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Ordenadas por prioridad dentro de cada tipo. La primera de cada grupo es la de
            mayor prioridad — la que gana ante reglas del mismo alcance.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Prioridad</span>
            <Select
              value={orden}
              onChange={(e) => setOrden(e.target.value as OrdenPrioridad)}
              className="w-auto"
            >
              <option value="desc">Mayor a menor</option>
              <option value="asc">Menor a mayor</option>
            </Select>
          </label>
        </div>
      )}

      {(['margen', 'descuento', 'recargo'] as TipoRegla[]).map((tipo) => {
        const grupo = grupos.get(tipo) ?? []
        if (grupo.length === 0) return null
        const ordenado = ordenarPorPrioridad(grupo, orden)
        return (
          <section key={tipo}>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant={TIPO_VARIANT[tipo]}>{TIPO_REGLA_LABEL[tipo]}</Badge>
              <span className="text-sm text-muted">
                {grupo.length} regla{grupo.length === 1 ? '' : 's'}
              </span>
            </div>
            <TableFrame>
              <DataTable className="min-w-[900px] table-fixed">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <THead>
                  <Th>Nombre</Th>
                  <Th>Alcance</Th>
                  <Th>Forma pago</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right">Prioridad</Th>
                  <Th>Vigencia</Th>
                  <Th></Th>
                </THead>
                <TBody>
                  {ordenado.map((r) => (
                    <Tr key={r.id_regla}>
                      <Td>
                        <div className="truncate" title={r.nombre}>
                          {r.nombre}
                        </div>
                      </Td>
                      <Td>{ALCANCE_LABEL[r.alcance]}</Td>
                      <Td>
                        {r.forma_pago ? formaPagoLabel(r.forma_pago) : <span className="text-muted">—</span>}
                      </Td>
                      <Td align="right" className="font-mono">{fmtValor(r)}</Td>
                      <Td align="right" className="font-mono">{r.prioridad}</Td>
                      <Td className="text-xs text-muted">{fmtVigencia(r)}</Td>
                      <Td align="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirm(r)}
                          disabled={pending}
                        >
                          Dar de baja
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </DataTable>
            </TableFrame>
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

      <PlanesCuotasModal
        open={cuotasOpen}
        onClose={() => setCuotasOpen(false)}
        planes={planes}
        onChange={setPlanes}
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

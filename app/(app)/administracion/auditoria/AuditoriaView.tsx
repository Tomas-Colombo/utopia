'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { AuditoriaConActor } from '@/lib/types/administracion'

/**
 * Visor de auditoría (Etapa 9 §L140). Read-only.
 * Filtros: entidad + rango de fechas. Modal de detalle para ver
 * el JSON `cambios` completo.
 */
export function AuditoriaView({
  rows,
  entidades,
  filtros,
}: {
  rows: AuditoriaConActor[]
  entidades: string[]
  filtros: { entidad: string; desde: string; hasta: string }
}) {
  const router = useRouter()
  const [entidad, setEntidad] = useState(filtros.entidad)
  const [desde, setDesde] = useState(filtros.desde)
  const [hasta, setHasta] = useState(filtros.hasta)
  const [detalle, setDetalle] = useState<AuditoriaConActor | null>(null)

  function aplicar() {
    const params = new URLSearchParams()
    if (entidad) params.set('entidad', entidad)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    router.push(qs ? `/administracion/auditoria?${qs}` : '/administracion/auditoria')
  }

  function limpiar() {
    setEntidad('')
    setDesde('')
    setHasta('')
    router.push('/administracion/auditoria')
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aplicar()
        }}
        className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
      >
        <div className="w-56">
          <Field htmlFor="a-ent" label="Entidad">
            <select
              id="a-ent"
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              className="w-full"
            >
              <option value="">Todas</option>
              {entidades.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-40">
          <Field htmlFor="a-d" label="Desde">
            <Input id="a-d" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
        </div>
        <div className="w-40">
          <Field htmlFor="a-h" label="Hasta">
            <Input id="a-h" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button type="button" variant="ghost" onClick={limpiar}>Limpiar</Button>
          <Button type="submit">Aplicar</Button>
        </div>
      </form>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Sin registros para estos filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id_auditoria} className="border-b border-border-2">
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {new Date(r.ts).toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-3">
                    {r.actor_nombre || r.actor_email || <span className="text-muted-2">(sistema)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{r.entidad}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">{r.accion}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {r.entidad_id ? r.entidad_id.slice(0, 8) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetalle(r)}>
                      Ver detalle
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!detalle}
        title="Detalle de auditoría"
        onClose={() => setDetalle(null)}
        size="xl"
      >
        {detalle && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Meta label="Entidad" value={detalle.entidad} />
              <Meta label="Acción" value={detalle.accion} />
              <Meta label="ID entidad" value={detalle.entidad_id ?? '—'} mono />
              <Meta label="Fecha" value={new Date(detalle.ts).toLocaleString('es-AR')} />
              <Meta label="Actor" value={detalle.actor_email ?? '(sistema)'} />
              <Meta label="IP" value={detalle.ip ?? '—'} mono />
            </div>
            <div>
              <div className="text-xs uppercase font-mono text-muted mb-1">Cambios</div>
              <pre className="rounded-md border border-border bg-card-2 p-3 text-xs overflow-auto max-h-[50vh]">
                {JSON.stringify(detalle.cambios, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className={mono ? 'font-mono text-xs' : ''}>{value}</div>
    </div>
  )
}

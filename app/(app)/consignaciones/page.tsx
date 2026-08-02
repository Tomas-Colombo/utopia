import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listConsignaciones } from '@/lib/dal/consignaciones/consignacion'
import {
  ESTADO_CONSIGNACION_LABEL,
  type EstadoConsignacion,
} from '@/lib/types/consignaciones'

const VARIANT: Record<EstadoConsignacion, 'success' | 'neutral'> = {
  activa: 'success',
  cerrada: 'neutral',
}

export default async function ConsignacionesPage() {
  const session = await verifySession()
  const rows = await listConsignaciones()
  const activas = rows.filter((r) => r.estado === 'activa').length
  const pendientesTotales = rows.reduce((a, r) => a + r.pendientes, 0)

  return (
    <>
      <Topbar
        title="Devoluciones a proveedor"
        session={session}
        actions={
          <Link href="/consignaciones/nueva">
            <Button size="sm">Nueva devolución</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Total" value={rows.length.toString()} />
          <Kpi label="Activas" value={activas.toString()} />
          <Kpi
            label="Ítems pendientes"
            value={pendientesTotales.toString()}
            variant={pendientesTotales > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Cerradas"
            value={(rows.length - activas).toString()}
          />
        </section>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="font-display text-lg mb-2">Sin consignaciones</p>
            <p className="text-sm text-muted mb-4">
              Cuando decidís devolver mercadería a un proveedor, creá un lote de consignación.
            </p>
            <Link
              href="/consignaciones/nueva"
              className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
            >
              Nueva devolución
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 text-right">Ítems</th>
                  <th className="px-4 py-3 text-right">Pendientes</th>
                  <th className="px-4 py-3 text-right">Devueltos</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id_consignacion} className="border-b border-border-2">
                    <td className="px-4 py-3">{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3">{r.proveedor?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.total_items}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {r.pendientes > 0 ? (
                        <span className="text-terracota">{r.pendientes}</span>
                      ) : (
                        r.pendientes
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{r.devueltos}</td>
                    <td className="px-4 py-3">
                      <Badge variant={VARIANT[r.estado]}>{ESTADO_CONSIGNACION_LABEL[r.estado]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/consignaciones/${r.id_consignacion}`}
                        className="text-sm text-pink-strong hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}

function Kpi({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: string
  variant?: 'default' | 'alert'
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        variant === 'alert' ? 'border-pink-strong bg-pink-bg' : 'border-border bg-card'
      }`}
    >
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl text-text">{value}</div>
    </div>
  )
}

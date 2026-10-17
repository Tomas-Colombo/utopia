import Link from 'next/link'
import { BandAction } from '@/components/shell/BandAction'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { listRendiciones } from '@/lib/dal/rendiciones/rendicion'
import {
  ESTADO_RENDICION_LABEL,
  type EstadoRendicion,
} from '@/lib/types/rendiciones'

const VARIANT: Record<EstadoRendicion, 'success' | 'warning'> = {
  pendiente: 'warning',
  pagada: 'success',
}

export default async function RendicionesPage() {
  const session = await verifySession()
  const rows = await listRendiciones()
  const pendientes = rows.filter((r) => r.estado === 'pendiente')
  const totalPendiente = pendientes.reduce((a, r) => a + Number(r.monto_total), 0)

  return (
    <>
      <Topbar
        title="Rendiciones"
        session={session}
        kpis={[
          { label: 'Total', value: rows.length.toString() },
          { label: 'Pendientes de pago', value: pendientes.length.toString(), tone: pendientes.length > 0 ? 'warn' : 'default' },
          { label: 'Monto adeudado', value: `$ ${totalPendiente.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, tone: totalPendiente > 0 ? 'warn' : 'default' },
          { label: 'Pagadas', value: (rows.length - pendientes.length).toString() },
        ]}
        actions={
          <BandAction
            href="/rendiciones/nueva"
            tone="primary"
            title="Generar rendición"
            description="Armar la rendición de un proveedor."
          />
        }
      />
      <main className="flex-1 p-6 space-y-6">

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="font-display text-lg mb-2">Sin rendiciones generadas</p>
            <p className="text-sm text-muted mb-4">
              Elegí un proveedor y previsualizá las ventas pendientes antes de saldar.
            </p>
            <Link
              href="/rendiciones/nueva"
              className="inline-flex items-center rounded-md bg-block px-4 py-2 text-sm font-semibold text-block-ink"
            >
              Generar rendición
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Líneas</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id_rendicion} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      {new Date(r.fecha_generacion).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3">{r.proveedor?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.periodo_desde
                        ? new Date(r.periodo_desde).toLocaleDateString('es-AR')
                        : '—'}{' '}
                      →{' '}
                      {r.periodo_hasta
                        ? new Date(r.periodo_hasta).toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{r.cantidad_lineas}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      $ {Number(r.monto_total).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={VARIANT[r.estado]}>{ESTADO_RENDICION_LABEL[r.estado]}</Badge>
                      {r.fecha_pago && (
                        <div className="text-xs text-muted mt-1">
                          {new Date(r.fecha_pago).toLocaleDateString('es-AR')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/rendiciones/${r.id_rendicion}`}
                        className="-mx-2 rounded-[4px] px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                      >
                        Ver
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


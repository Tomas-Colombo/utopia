import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { getRendicionConDetalle } from '@/lib/dal/rendiciones/rendicion'
import {
  ESTADO_RENDICION_LABEL,
  type EstadoRendicion,
} from '@/lib/types/rendiciones'
import { RendicionActions } from './RendicionActions'

const VARIANT: Record<EstadoRendicion, 'success' | 'warning'> = {
  pendiente: 'warning',
  pagada: 'success',
}

export default async function RendicionDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const rendicion = await getRendicionConDetalle(id)
  if (!rendicion) notFound()

  const total = Number(rendicion.monto_total)

  return (
    <>
      <Topbar
        title={`Rendición ${new Date(rendicion.fecha_generacion).toLocaleDateString('es-AR')}`}
        session={session}
        backHref="/rendiciones"
        actions={
          <Badge variant={VARIANT[rendicion.estado]}>
            {ESTADO_RENDICION_LABEL[rendicion.estado]}
          </Badge>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs uppercase font-mono text-muted">Proveedor</div>
            <div className="mt-1">{rendicion.proveedor?.nombre ?? '—'}</div>
            {rendicion.proveedor?.telefono && (
              <div className="text-xs text-muted">{rendicion.proveedor.telefono}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase font-mono text-muted">Período incluido</div>
            <div className="mt-1 text-xs">
              {rendicion.periodo_desde ? new Date(rendicion.periodo_desde).toLocaleDateString('es-AR') : '—'}{' '}
              →{' '}
              {rendicion.periodo_hasta ? new Date(rendicion.periodo_hasta).toLocaleDateString('es-AR') : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase font-mono text-muted">Total</div>
            <div className="mt-1 font-mono font-semibold text-lg">
              $ {total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-muted">{rendicion.cantidad_lineas} líneas</div>
          </div>
          <div className="flex items-end justify-end">
            {rendicion.estado === 'pendiente' && (
              <RendicionActions idRendicion={rendicion.id_rendicion} />
            )}
            {rendicion.estado === 'pagada' && rendicion.fecha_pago && (
              <div className="text-xs text-muted">
                Pagada el {new Date(rendicion.fecha_pago).toLocaleDateString('es-AR')}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-lg">Líneas rendidas</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Fecha venta</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">QR</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Precio venta</th>
                <th className="px-4 py-3 text-right">Monto proveedor</th>
              </tr>
            </thead>
            <tbody>
              {rendicion.lineas.map((l) => (
                <tr key={l.id_detalle_venta} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    {new Date(l.fecha).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.producto_nombre}</div>
                    {l.producto_sku && (
                      <div className="text-xs font-mono text-muted">{l.producto_sku}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.qr_code}</td>
                  <td className="px-4 py-3 text-xs">
                    {l.cliente_nombre ?? <span className="text-muted-2">Mostrador</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    $ {Number(l.precio_venta).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    $ {Number(l.monto_proveedor).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-card-2">
                <td colSpan={5} className="px-4 py-3 font-semibold">Total</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  $ {total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {rendicion.observaciones && (
          <div className="rounded-lg border border-border bg-card-2 p-4 text-sm">
            <div className="text-xs uppercase font-mono text-muted mb-1">Observaciones</div>
            <div>{rendicion.observaciones}</div>
          </div>
        )}
      </main>
    </>
  )
}

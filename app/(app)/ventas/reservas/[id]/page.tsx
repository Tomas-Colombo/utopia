import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { getReservaConDetalle } from '@/lib/dal/reservas/reserva'
import {
  ESTADO_RESERVA_LABEL,
  type EstadoReserva,
} from '@/lib/types/ventas'
import { ReservaDetalleActions } from './ReservaDetalleActions'

const VARIANT: Record<EstadoReserva, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  activa: 'success',
  cancelada: 'neutral',
  vencida: 'warning',
  convertida_venta: 'info',
}

export default async function ReservaDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const reserva = await getReservaConDetalle(id)
  if (!reserva) notFound()

  return (
    <>
      <Topbar
        title={`Reserva ${new Date(reserva.fecha).toLocaleDateString('es-AR')}`}
        session={session}
        backHref="/ventas/reservas"
        actions={
          <Badge variant={VARIANT[reserva.estado_reserva]}>
            {ESTADO_RESERVA_LABEL[reserva.estado_reserva]}
          </Badge>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs uppercase font-mono text-muted">Cliente</div>
            <div className="mt-1">{reserva.cliente?.nombre ?? 'Mostrador'}</div>
          </div>
          <div>
            <div className="text-xs uppercase font-mono text-muted">Fecha</div>
            <div className="mt-1">{new Date(reserva.fecha).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div className="text-xs uppercase font-mono text-muted">Vence</div>
            <div className="mt-1">{new Date(reserva.fecha_vencimiento).toLocaleString('es-AR')}</div>
          </div>
          <div className="flex items-end justify-end gap-2">
            {reserva.estado_reserva === 'activa' && (
              <>
                <Link href={`/ventas/nueva?reserva=${reserva.id_reserva}`}>
                  <Button size="sm">Convertir en venta</Button>
                </Link>
                <ReservaDetalleActions idReserva={reserva.id_reserva} />
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">QR</th>
                <th className="px-4 py-3 text-right">Precio snapshot</th>
                <th className="px-4 py-3">Estado ítem</th>
                <th className="px-4 py-3">Estado línea</th>
              </tr>
            </thead>
            <tbody>
              {reserva.lineas.map((l) => (
                <tr key={l.id_detalle_reserva} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.producto?.nombre ?? '—'}</div>
                    {l.producto?.sku && (
                      <div className="text-xs font-mono text-muted">{l.producto.sku}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.item?.qr_code ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    $ {Number(l.precio_snapshot).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 capitalize text-xs">{l.item?.estado_item ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={VARIANT[l.estado]}>{ESTADO_RESERVA_LABEL[l.estado]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {reserva.observaciones && (
          <div className="rounded-lg border border-border bg-card-2 p-4 text-sm">
            <div className="text-xs uppercase font-mono text-muted mb-1">Observaciones</div>
            <div>{reserva.observaciones}</div>
          </div>
        )}
      </main>
    </>
  )
}

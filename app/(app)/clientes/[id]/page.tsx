import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { getCliente } from '@/lib/dal/clientes/cliente'
import { listVentasPorCliente } from '@/lib/dal/ventas/venta'
import { listReservasPorCliente } from '@/lib/dal/reservas/reserva'
import {
  ESTADO_RESERVA_LABEL,
  type EstadoReserva,
} from '@/lib/types/ventas'

const VARIANT: Record<EstadoReserva, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  activa: 'success',
  cancelada: 'neutral',
  vencida: 'warning',
  convertida_venta: 'info',
}

export default async function ClienteDetallePage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const [cliente, ventas, reservas] = await Promise.all([
    getCliente(id),
    listVentasPorCliente(id),
    listReservasPorCliente(id),
  ])
  if (!cliente) notFound()

  const totalComprado = ventas
    .filter((v) => v.estado_venta === 'registrada')
    .reduce((a, v) => a + Number(v.total), 0)

  return (
    <>
      <Topbar
        title={cliente.nombre}
        session={session}
        backHref="/clientes"
        actions={
          <Badge variant={cliente.activo ? 'success' : 'neutral'}>
            {cliente.activo ? 'Activo' : 'Inactivo'}
          </Badge>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <section className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Kpi label="Compras" value={ventas.length.toString()} />
          <Kpi
            label="Total facturado"
            value={`$ ${totalComprado.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
          />
          <Kpi label="Reservas" value={reservas.length.toString()} />
          <Kpi
            label="Reservas activas"
            value={reservas.filter((r) => r.estado_reserva === 'activa').length.toString()}
          />
        </section>

        <section className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs uppercase font-mono text-muted">Teléfono</div>
            <div>{cliente.telefono ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase font-mono text-muted">Email</div>
            <div>{cliente.email ?? '—'}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs uppercase font-mono text-muted">Notas</div>
            <div>{cliente.notas ?? '—'}</div>
          </div>
        </section>

        {/* Historial ventas */}
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-lg">Historial de compras</h3>
          </div>
          {ventas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Sin compras registradas.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Forma pago</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id_venta} className="border-b border-border-2">
                    <td className="px-4 py-3">{new Date(v.fecha).toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 capitalize">{v.forma_pago.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      $ {Number(v.total).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3">
                      {v.estado_venta === 'anulada' ? (
                        <Badge variant="danger">Anulada</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/ventas/${v.id_venta}`}
                        className="text-sm text-pink-strong hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Historial reservas */}
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-lg">Historial de reservas</h3>
          </div>
          {reservas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Sin reservas registradas.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Vence</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id_reserva} className="border-b border-border-2">
                    <td className="px-4 py-3">{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3">{new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3">
                      <Badge variant={VARIANT[r.estado_reserva]}>
                        {ESTADO_RESERVA_LABEL[r.estado_reserva]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/ventas/reservas/${r.id_reserva}`}
                        className="text-sm text-pink-strong hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className="mt-1 font-display text-xl">{value}</div>
    </div>
  )
}

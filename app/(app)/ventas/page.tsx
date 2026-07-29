import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listVentas } from '@/lib/dal/ventas/venta'
import { listReservas } from '@/lib/dal/reservas/reserva'

export default async function VentasHome() {
  const session = await verifySession()
  const [ventas, reservasActivas] = await Promise.all([
    listVentas({ limit: 500 }),
    listReservas({ estado: 'activa' }),
  ])

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const ventasHoy = ventas.filter(
    (v) => v.estado_venta === 'registrada' && new Date(v.fecha) >= hoy,
  )
  const totalHoy = ventasHoy.reduce((a, v) => a + Number(v.total), 0)

  const proximasVencer = reservasActivas.filter((r) => {
    const d = new Date(r.fecha_vencimiento).getTime() - Date.now()
    return d > 0 && d < 1000 * 60 * 60 * 48 // < 48h
  }).length

  return (
    <>
      <Topbar
        title="Ventas"
        session={session}
        actions={
          <Link href="/ventas/nueva">
            <Button size="sm">Nueva venta</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Ventas hoy" value={ventasHoy.length.toString()} />
          <Kpi
            label="Facturado hoy"
            value={`$ ${totalHoy.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          />
          <Kpi label="Reservas activas" value={reservasActivas.length.toString()} />
          <Kpi
            label="Vencen pronto"
            value={proximasVencer.toString()}
            variant={proximasVencer > 0 ? 'alert' : 'default'}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Link
            href="/ventas/nueva"
            className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <div className="text-sm text-muted">Vender ahora</div>
            <div className="mt-1 font-display text-xl">Nueva venta</div>
            <p className="mt-2 text-sm text-muted">
              Escaneo QR + búsqueda manual. Precio según forma de pago.
            </p>
          </Link>
          <Link
            href="/ventas/reservas"
            className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <div className="text-sm text-muted">Gestionar</div>
            <div className="mt-1 font-display text-xl">Reservas</div>
            <p className="mt-2 text-sm text-muted">
              Ver reservas activas, cancelar, convertir en venta.
            </p>
          </Link>
          <Link
            href="/clientes"
            className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <div className="text-sm text-muted">Base</div>
            <div className="mt-1 font-display text-xl">Clientes</div>
            <p className="mt-2 text-sm text-muted">
              Alta, edición, historial de compras y reservas por cliente.
            </p>
          </Link>
        </section>

        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Últimas ventas</h3>
            <Link href="/ventas" className="text-sm text-pink-strong hover:underline">
              Ver todas
            </Link>
          </div>
          {ventas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Sin ventas registradas todavía.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Forma pago</th>
                  <th className="px-4 py-3 text-right">Líneas</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ventas.slice(0, 10).map((v) => (
                  <tr key={v.id_venta} className="border-b border-border-2">
                    <td className="px-4 py-3">{new Date(v.fecha).toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3">{v.cliente?.nombre ?? 'Mostrador'}</td>
                    <td className="px-4 py-3 capitalize">{v.forma_pago.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right font-mono">{v.lineas_count}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      $ {Number(v.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      {v.estado_venta === 'anulada' ? (
                        <span className="text-xs uppercase font-mono text-pink-strong">Anulada</span>
                      ) : (
                        <span className="text-xs uppercase font-mono text-success">OK</span>
                      )}
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

import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listVentas } from '@/lib/dal/ventas/venta'
import { listReservas } from '@/lib/dal/reservas/reserva'
import {
  esFechaValida,
  inicioDelDia,
  inicioDelDiaSiguiente,
  mesActual,
} from '@/lib/fechas'
import { VentasFiltros } from './VentasFiltros'

/**
 * Home del módulo Ventas: punto de entrada del vendedor al iniciar sesión.
 *
 * El listado se filtra por período vía URL (`?desde=&hasta=`, días calendario
 * inclusivos). Sin params, muestra el MES EN CURSO — es lo que un vendedor
 * quiere ver al entrar, y además acota la query en vez de traer las últimas
 * 500 ventas de toda la historia.
 *
 * Los KPIs siguen al filtro (no son fijos de "hoy"): un contador que ignora el
 * período activo confunde más de lo que informa. `Reservas activas` es la
 * excepción — no depende del rango, son las que están vivas ahora.
 */
export default async function VentasHome(props: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams

  // Params inválidos o incompletos → mes en curso. Nunca reventar por una URL
  // tipeada a mano.
  const porDefecto = mesActual()
  const desde = esFechaValida(searchParams.desde) ? searchParams.desde : porDefecto.desde
  const hastaCrudo = esFechaValida(searchParams.hasta) ? searchParams.hasta : porDefecto.hasta
  const hasta = hastaCrudo < desde ? desde : hastaCrudo

  const [ventas, reservasActivas] = await Promise.all([
    listVentas({
      desde: inicioDelDia(desde),
      hastaExclusivo: inicioDelDiaSiguiente(hasta),
      limit: 500,
    }),
    listReservas({ estado: 'activa' }),
  ])

  const registradas = ventas.filter((v) => v.estado_venta === 'registrada')
  const facturado = registradas.reduce((a, v) => a + Number(v.total), 0)
  const anuladas = ventas.length - registradas.length

  const proximasVencer = reservasActivas.filter((r) => {
    const d = new Date(r.fecha_vencimiento).getTime() - Date.now()
    return d > 0 && d < 1000 * 60 * 60 * 48 // < 48h
  }).length

  const fmtDia = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR')

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
        <VentasFiltros desde={desde} hasta={hasta} />

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Ventas del período" value={registradas.length.toString()} />
          <Kpi
            label="Facturado en el período"
            value={`$ ${facturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          />
          <Kpi label="Reservas activas" value={reservasActivas.length.toString()} />
          <Kpi
            label="Vencen pronto"
            value={proximasVencer.toString()}
            variant={proximasVencer > 0 ? 'alert' : 'default'}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        </section>

        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg">Ventas del período</h3>
            <span className="text-xs text-muted">
              {fmtDia(desde)} → {fmtDia(hasta)}
              {anuladas > 0 && ` · ${anuladas} anulada${anuladas === 1 ? '' : 's'}`}
            </span>
          </div>
          {ventas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              No hay ventas en el período seleccionado.
            </div>
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
                {ventas.map((v) => (
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

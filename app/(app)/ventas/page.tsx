import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import { listVentasPaginado, resumenVentasPeriodo } from '@/lib/dal/ventas/venta'
import { listReservas } from '@/lib/dal/reservas/reserva'
import { listAlertasCuotasVencidas } from '@/lib/dal/reportes/reportes'
import { waMeLink } from '@/lib/utils/waMeLink'
import { nombreCliente } from '@/lib/types/ventas'
import {
  esFechaValida,
  inicioDelDia,
  inicioDelDiaSiguiente,
  mesActual,
} from '@/lib/fechas'
import { VentasFiltros } from './VentasFiltros'
import { VentasPaginacion } from './VentasPaginacion'
import { hoyISO } from '@/lib/utils/hoy'

const PAGE_SIZE = 50

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
 *
 * La tabla está paginada server-side (`?pagina=`), pero los KPIs y el export
 * CSV se calculan sobre el período COMPLETO: si dependieran de la página
 * visible, cambiarían al pasar de página, que es exactamente lo contrario de
 * lo que un KPI tiene que hacer.
 */
export default async function VentasHome(props: {
  searchParams: Promise<{ desde?: string; hasta?: string; pagina?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams

  // Params inválidos o incompletos → mes en curso. Nunca reventar por una URL
  // tipeada a mano.
  const porDefecto = mesActual()
  const desde = esFechaValida(searchParams.desde) ? searchParams.desde : porDefecto.desde
  const hastaCrudo = esFechaValida(searchParams.hasta) ? searchParams.hasta : porDefecto.hasta
  const hasta = hastaCrudo < desde ? desde : hastaCrudo

  const paginaPedida = Number(searchParams.pagina)
  const pagina = Number.isFinite(paginaPedida) && paginaPedida > 1 ? Math.floor(paginaPedida) : 1

  const periodo = {
    desde: inicioDelDia(desde),
    hastaExclusivo: inicioDelDiaSiguiente(hasta),
  }

  // La alerta de deuda NO se recorta por el período del filtro: una cuota
  // vencida en julio sigue vencida aunque estés mirando agosto.
  const hoy = hoyISO()

  const [{ rows: ventas, total }, resumen, reservasActivas, alertasCuotas] =
    await Promise.all([
      listVentasPaginado({ ...periodo, page: pagina, pageSize: PAGE_SIZE }),
      resumenVentasPeriodo(periodo),
      listReservas({ estado: 'activa' }),
      listAlertasCuotasVencidas(hoy),
    ])

  const totalVencido = alertasCuotas.reduce((a, x) => a + x.monto_vencido, 0)

  // `?pagina=` fuera de rango (link viejo, o el período se achicó): mando a la
  // última página real en vez de mostrar una tabla vacía que miente.
  const ultimaPagina = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (pagina > ultimaPagina && total > 0) {
    const params = new URLSearchParams({ desde, hasta })
    if (ultimaPagina > 1) params.set('pagina', String(ultimaPagina))
    redirect(`/ventas?${params.toString()}`)
  }

  const proximasVencer = contarProximasAVencer(reservasActivas)

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

        {/* Alerta de deuda vencida. Vive acá y no sólo en /cuotas porque es
            la pantalla que se mira todos los días: una deuda vencida que hay
            que ir a buscar a otra sección no se cobra.

            Una fila por CLIENTE, no por cuota: a la persona se la llama una
            vez por todo lo que debe. Con el link de WhatsApp al lado, que es
            lo que se hace efectivamente con esta información. */}
        {alertasCuotas.length > 0 && (
          <section className="rounded-lg border border-alerta-ink bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-alerta-ink">Cuotas vencidas</h3>
              <span className="text-xs text-muted">
                {alertasCuotas.length} cliente{alertasCuotas.length === 1 ? '' : 's'} ·{' '}
                <span className="font-mono">
                  $ {totalVencido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {alertasCuotas.slice(0, 6).map((a) => {
                const wa = waMeLink(a.cliente_telefono)
                return (
                  <div
                    key={a.id_cliente}
                    className="flex items-center justify-between gap-2 rounded-md bg-card-2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/clientes/${a.id_cliente}?from=cuotas`}
                        className="block truncate font-medium hover:underline"
                      >
                        {a.cliente_nombre}
                      </Link>
                      <div className="truncate text-xs text-muted">
                        {a.cuotas_vencidas} cuota{a.cuotas_vencidas === 1 ? '' : 's'} ·
                        hace {a.dias_vencido} día{a.dias_vencido === 1 ? '' : 's'}
                        {wa && (
                          <>
                            {' · '}
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-strong hover:underline"
                            >
                              WhatsApp
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono font-semibold text-alerta-ink">
                      $ {a.monto_vencido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )
              })}
              {alertasCuotas.length > 6 && (
                <Link
                  href="/cuotas?estado=vencidas"
                  className="pt-1 text-center text-xs text-muted hover:underline md:col-span-2"
                >
                  +{alertasCuotas.length - 6} más — ver todas
                </Link>
              )}
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Ventas del período" value={resumen.registradas.toString()} />
          <Kpi
            label="Facturado en el período"
            value={`$ ${resumen.facturado.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
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
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg">Ventas del período</h3>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted">
                {fmtDia(desde)} → {fmtDia(hasta)}
                {resumen.anuladas > 0 &&
                  ` · ${resumen.anuladas} anulada${resumen.anuladas === 1 ? '' : 's'}`}
              </span>
              {/* Exporta el período completo, no la página visible. */}
              <a
                href={`/api/ventas/export?desde=${desde}&hasta=${hasta}`}
                download
                aria-disabled={total === 0}
              >
                <Button size="sm" variant="secondary" disabled={total === 0}>
                  Exportar CSV
                </Button>
              </a>
            </div>
          </div>
          {ventas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              No hay ventas en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Forma pago</th>
                    <th className="px-4 py-3 text-right">Líneas</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id_venta} className="border-b border-border-2">
                      <td className="px-4 py-3">{new Date(v.fecha).toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3">{nombreCliente(v.cliente)}</td>
                      <td className="px-4 py-3 capitalize">{v.forma_pago.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right font-mono">{v.lineas_count}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        $ {Number(v.total).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3">
                        {v.estado_venta === 'anulada' ? (
                          <span className="text-xs uppercase font-mono text-pink-strong">
                            Anulada
                          </span>
                        ) : (
                          <span className="text-xs uppercase font-mono text-success">OK</span>
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
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="border-t border-border px-3">
              <VentasPaginacion page={pagina} pageSize={PAGE_SIZE} total={total} />
            </div>
          )}
        </section>
      </main>
    </>
  )
}


const EN_48_HORAS = 1000 * 60 * 60 * 48

/**
 * Reservas que vencen dentro de las próximas 48 h.
 *
 * Vive fuera del componente a propósito. Lee el reloj, y eso en el cuerpo de
 * un componente es una lectura impura: la regla existe para proteger los
 * re-renders del cliente, donde dos lecturas del mismo render tienen que
 * coincidir. Este es un Server Component, se renderiza una vez por pedido, y
 * "ahora" es justamente un dato del pedido — así que la lectura es correcta y
 * acá queda explícita, con un solo `Date.now()` compartido por todas las filas
 * en vez de uno por iteración.
 */
function contarProximasAVencer(reservas: { fecha_vencimiento: string }[]): number {
  const ahora = Date.now()
  return reservas.filter((r) => {
    const restante = new Date(r.fecha_vencimiento).getTime() - ahora
    return restante > 0 && restante < EN_48_HORAS
  }).length
}

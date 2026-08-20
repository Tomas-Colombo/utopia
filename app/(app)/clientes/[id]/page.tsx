import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import { hasPermission } from '@/lib/dal/guard'
import { getCliente } from '@/lib/dal/clientes/cliente'
import { listVentasPorCliente } from '@/lib/dal/ventas/venta'
import { listReservasPorCliente } from '@/lib/dal/reservas/reserva'
import { listCuotasPorCliente } from '@/lib/dal/cuotas/cuota'
import { listCuentasDestino } from '@/lib/dal/ventas/cuenta-destino'
import { saldoCuota } from '@/lib/cuotas/generar-plan'
import { nombreCliente } from '@/lib/types/ventas'
import { ClienteDetalleView } from './ClienteDetalleView'
import { CuotasClienteView } from './CuotasClienteView'

/**
 * Ficha del cliente: quién es, cuánto compró y cuánto debe.
 *
 * `?from=cuotas` hace que "volver" regrese al panel de deuda. Se entra acá
 * desde dos lugares distintos y mandar siempre a `/clientes` obligaba a
 * rehacer el filtro del panel cada vez que se revisaba un deudor.
 */
export default async function ClienteDetallePage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const { from } = await props.searchParams

  // `hoy` una sola vez: "vencida" tiene que significar lo mismo en el KPI y
  // en cada fila de la tabla de abajo.
  const hoy = new Date().toLocaleDateString('en-CA')

  const [cliente, ventas, reservas, cuotas, cuentas] = await Promise.all([
    getCliente(id),
    listVentasPorCliente(id),
    listReservasPorCliente(id),
    listCuotasPorCliente(id, { estado: 'todas', hoy }),
    listCuentasDestino({ soloActivas: true }),
  ])
  if (!cliente) notFound()

  const registradas = ventas.filter((v) => v.estado_venta === 'registrada')
  const totalComprado = registradas.reduce((a, v) => a + Number(v.total), 0)

  const conDeuda = cuotas.filter((c) => c.estado === 'pendiente' || c.estado === 'parcial')
  const adeudado = conDeuda.reduce((a, c) => a + saldoCuota(c), 0)
  const vencido = conDeuda
    .filter((c) => c.fecha_vencimiento < hoy)
    .reduce((a, c) => a + saldoCuota(c), 0)

  const puedeMarcarIncobrable = hasPermission(session, 'ventas', 'eliminar')

  return (
    <>
      <Topbar
        title={nombreCliente(cliente)}
        session={session}
        backHref={from === 'cuotas' ? '/cuotas' : '/clientes'}
        actions={
          <Badge variant={cliente.activo ? 'success' : 'neutral'}>
            {cliente.activo ? 'Activo' : 'Inactivo'}
          </Badge>
        }
      />
      <main className="flex-1 space-y-6 p-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Compras" value={String(registradas.length)} variant="nested" />
          <Kpi label="Total comprado" value={money(totalComprado)} variant="nested" />
          <Kpi
            label="Adeuda"
            value={money(adeudado)}
            variant={adeudado > 0 ? 'highlight' : 'nested'}
            tone={adeudado > 0 ? undefined : 'muted'}
            sub={conDeuda.length > 0 ? `${conDeuda.length} cuotas pendientes` : undefined}
          />
          <Kpi
            label="Vencido"
            value={money(vencido)}
            variant="nested"
            tone={vencido > 0 ? undefined : 'muted'}
            sub={vencido > 0 ? 'Requiere gestión' : undefined}
          />
        </section>

        <ClienteDetalleView cliente={cliente} ventas={ventas} reservas={reservas} />

        {/* Sólo si alguna vez compró financiado: en una cartera donde casi
            nadie usa cuotas, una sección vacía en cada ficha es ruido. */}
        {cuotas.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg">Cuotas</h2>
            <CuotasClienteView
              cuotas={cuotas}
              cuentas={cuentas}
              hoy={hoy}
              puedeMarcarIncobrable={puedeMarcarIncobrable}
            />
          </section>
        )}
      </main>
    </>
  )
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

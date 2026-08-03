import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listClientes } from '@/lib/dal/clientes/cliente'
import { listReservas } from '@/lib/dal/reservas/reserva'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { listCuentasDestino } from '@/lib/dal/ventas/cuenta-destino'
import { NuevaVentaView } from './NuevaVentaView'

export default async function NuevaVentaPage(props: {
  searchParams: Promise<{ reserva?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const [clientes, reservasActivas, productos, cuentas] = await Promise.all([
    listClientes({ soloActivos: true }),
    listReservas({ estado: 'activa' }),
    listProductosConDetalle({ soloActivos: true }),
    listCuentasDestino({ soloActivas: true }),
  ])
  return (
    <>
      <Topbar title="Nueva venta" session={session} backHref="/ventas" />
      <main className="flex-1 p-6">
        <NuevaVentaView
          clientes={clientes.map((c) => ({
            id: c.id_cliente,
            nombre: c.nombre,
            telefono: c.telefono,
          }))}
          reservasActivas={reservasActivas.map((r) => ({
            id: r.id_reserva,
            fecha: r.fecha,
            fecha_vencimiento: r.fecha_vencimiento,
            cliente_nombre: r.cliente?.nombre ?? null,
            items_count: r.items_count,
          }))}
          productos={productos.filter((p) => p.stock_disponible > 0)}
          cuentas={cuentas}
          idReservaPreseleccionada={searchParams.reserva ?? null}
        />
      </main>
    </>
  )
}

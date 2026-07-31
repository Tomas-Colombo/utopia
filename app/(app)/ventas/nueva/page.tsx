import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listClientes } from '@/lib/dal/clientes/cliente'
import { listReservas } from '@/lib/dal/reservas/reserva'
import { NuevaVentaView } from './NuevaVentaView'

export default async function NuevaVentaPage(props: {
  searchParams: Promise<{ reserva?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const [clientes, reservasActivas] = await Promise.all([
    listClientes({ soloActivos: true }),
    listReservas({ estado: 'activa' }),
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
          idReservaPreseleccionada={searchParams.reserva ?? null}
        />
      </main>
    </>
  )
}

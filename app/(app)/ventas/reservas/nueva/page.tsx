import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listClientes } from '@/lib/dal/clientes/cliente'
import { NuevaReservaView } from './NuevaReservaView'

export default async function NuevaReservaPage() {
  const session = await verifySession()
  const clientes = await listClientes({ soloActivos: true })
  return (
    <>
      <Topbar title="Nueva reserva" session={session} backHref="/ventas/reservas" />
      <main className="flex-1 p-6">
        <NuevaReservaView
          clientes={clientes.map((c) => ({
            id: c.id_cliente,
            nombre: c.nombre,
            telefono: c.telefono,
          }))}
        />
      </main>
    </>
  )
}

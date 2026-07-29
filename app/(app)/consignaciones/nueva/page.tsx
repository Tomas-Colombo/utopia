import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { NuevaConsignacionForm } from './NuevaConsignacionForm'

export default async function NuevaConsignacionPage() {
  const session = await verifySession()
  const proveedores = await listProveedoresActivos()
  // Solo tiene sentido consignar a proveedores que traen consignación.
  const consignatarios = proveedores.filter((p) => p.tipo === 'consignatario')
  return (
    <>
      <Topbar title="Nueva consignación" session={session} />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <NuevaConsignacionForm
            proveedores={(consignatarios.length > 0 ? consignatarios : proveedores).map((p) => ({
              id: p.id_proveedor,
              nombre: p.nombre,
              tipo: p.tipo,
            }))}
            soloConsignatarios={consignatarios.length > 0}
          />
        </div>
      </main>
    </>
  )
}

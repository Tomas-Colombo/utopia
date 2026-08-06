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
      <Topbar title="Nueva devolución a proveedor" session={session} backHref="/consignaciones" />
      {/* Sin tope de ancho: el alta dejó de ser proveedor + notas y ahora
          incluye el carrito de ítems, así que la tarjeta ocupa el ancho
          disponible del área de contenido en vez de quedar fija. */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="w-full rounded-lg border border-border bg-card p-4 sm:p-6">
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

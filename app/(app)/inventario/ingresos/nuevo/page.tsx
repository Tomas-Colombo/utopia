import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { NuevoIngresoForm } from './NuevoIngresoForm'

export default async function NuevoIngresoPage() {
  const session = await verifySession()
  // Ya no bloqueamos cuando no hay proveedores: el ingreso puede ser
  // «sin proveedor», y el proveedor se puede crear inline desde el form.
  const proveedores = await listProveedoresActivos()
  return (
    <>
      <Topbar title="Nuevo ingreso" session={session} backHref="/inventario/ingresos" />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <NuevoIngresoForm proveedores={proveedores} />
        </div>
      </main>
    </>
  )
}

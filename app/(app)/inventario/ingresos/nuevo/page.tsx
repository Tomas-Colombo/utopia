import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { NuevoIngresoForm } from './NuevoIngresoForm'

export default async function NuevoIngresoPage() {
  const session = await verifySession()
  const proveedores = await listProveedoresActivos()
  if (proveedores.length === 0) {
    redirect('/inventario/proveedores/nuevo?e=needs-proveedor')
  }
  return (
    <>
      <Topbar title="Nuevo ingreso" session={session} />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <NuevoIngresoForm proveedores={proveedores} />
        </div>
      </main>
    </>
  )
}

import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { NuevoProveedorForm } from './NuevoProveedorForm'

export default async function NuevoProveedorPage() {
  const session = await verifySession()
  return (
    <>
      <Topbar title="Nuevo proveedor" session={session} backHref="/proveedores" />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <NuevoProveedorForm />
        </div>
      </main>
    </>
  )
}

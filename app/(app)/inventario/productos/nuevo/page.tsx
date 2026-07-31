import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { NuevoProductoForm } from './NuevoProductoForm'

export default async function NuevoProductoPage() {
  const session = await verifySession()
  const [categorias, productos, proveedores] = await Promise.all([
    listCategoriasActivas(),
    listProductosConDetalle(),
    listProveedoresActivos(),
  ])
  if (categorias.length === 0) {
    // Sin categorías no se puede crear producto; mandamos a categorías.
    redirect('/inventario/categorias?e=needs-categoria')
  }
  return (
    <>
      <Topbar title="Nuevo producto" session={session} backHref="/inventario" />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <NuevoProductoForm
            categorias={categorias}
            productos={productos}
            proveedores={proveedores}
          />
        </div>
      </main>
    </>
  )
}

import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { NuevaReglaForm } from './NuevaReglaForm'

export default async function NuevaReglaPage() {
  const session = await verifySession()
  const [categorias, proveedores, productos] = await Promise.all([
    listCategoriasActivas(),
    listProveedoresActivos(),
    listProductosConDetalle({ soloActivos: true }),
  ])
  return (
    <>
      <Topbar title="Nueva regla de precio" session={session} backHref="/precios/reglas" />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <NuevaReglaForm
            categorias={categorias.map((c) => ({ id: c.id_categoria, nombre: c.nombre }))}
            proveedores={proveedores.map((p) => ({ id: p.id_proveedor, nombre: p.nombre }))}
            productos={productos.map((p) => ({
              id: p.id_producto,
              nombre: p.nombre,
              sku: p.sku,
            }))}
          />
        </div>
      </main>
    </>
  )
}

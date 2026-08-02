import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { NuevoIngresoView } from './NuevoIngresoView'

export default async function NuevoIngresoPage() {
  const session = await verifySession()
  // Todo se carga en una sola pantalla: proveedores para la cabecera y
  // productos/categorías para la carga de líneas (PDF o a mano). El ingreso
  // puede ser «sin proveedor», y el proveedor se crea inline desde el form.
  const [proveedores, productos, categorias] = await Promise.all([
    listProveedoresActivos(),
    listProductosConDetalle({ soloActivos: true }),
    listCategoriasActivas(),
  ])
  return (
    <>
      <Topbar title="Nuevo ingreso" session={session} backHref="/inventario/ingresos" />
      <main className="flex-1 p-6">
        <NuevoIngresoView
          proveedores={proveedores}
          productos={productos}
          categorias={categorias}
        />
      </main>
    </>
  )
}

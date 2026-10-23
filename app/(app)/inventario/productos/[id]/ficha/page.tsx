import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { getCategoria, listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { getProducto } from '@/lib/dal/inventario/producto'
import {
  getProveedorHabitualDeProducto,
  listItemsByProducto,
} from '@/lib/dal/inventario/item'
import { FichaProductoView } from './FichaProductoView'

/**
 * Ficha de solo-lectura del producto (estado + talles + stock por talle).
 * Es una vista distinta de /inventario/productos/[id] (que es el editor)
 * y de /inventario/ficha/[qr] (que es la ficha por ítem escaneado).
 */
export default async function FichaProductoPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params

  const producto = await getProducto(id)
  if (!producto) notFound()

  const [categoria, categorias, proveedor, items] = await Promise.all([
    getCategoria(producto.id_categoria),
    listCategoriasActivas(),
    getProveedorHabitualDeProducto(id),
    listItemsByProducto(id),
  ])

  // stock_disponible / stock_total: los derivamos de los items para no
  // depender del RPC de listado (que trae toda la tabla).
  const stockDisponible = items.filter((it) => it.estado_item === 'disponible').length
  const stockTotal = items.filter(
    (it) => it.estado_item !== 'baja' && it.estado_item !== 'devuelto',
  ).length

  return (
    <>
      <Topbar
        title={`Producto: ${producto.nombre}`}
        session={session}
        backHref="/inventario"
      />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <FichaProductoView
            producto={producto}
            categoria={categoria}
            categorias={categorias}
            proveedor={proveedor}
            items={items}
            stockDisponible={stockDisponible}
            stockTotal={stockTotal}
          />
        </div>
      </main>
    </>
  )
}

import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { getCategoria, listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { getProducto } from '@/lib/dal/inventario/producto'
import {
  getProveedorHabitualDeProducto,
  listItemsByProducto,
} from '@/lib/dal/inventario/item'
import { createServerClient } from '@/lib/dal/supabase'
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

  const [categoria, categorias, proveedor, items, costo] = await Promise.all([
    getCategoria(producto.id_categoria),
    listCategoriasActivas(),
    getProveedorHabitualDeProducto(id),
    listItemsByProducto(id),
    fetchCostoVigente(id),
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
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl">
          <FichaProductoView
            producto={producto}
            categoria={categoria}
            categorias={categorias}
            proveedor={proveedor}
            items={items}
            costoVigente={costo?.costo ?? null}
            monedaVigente={costo?.moneda ?? null}
            stockDisponible={stockDisponible}
            stockTotal={stockTotal}
          />
        </div>
      </main>
    </>
  )
}

async function fetchCostoVigente(
  idProducto: string,
): Promise<{ costo: number; moneda: string } | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('costo_producto')
    .select('costo, moneda')
    .eq('id_producto', idProducto)
    .is('vigente_hasta', null)
    .maybeSingle()
  if (error) throw new Error(`fetchCostoVigente: ${error.message}`)
  if (!data) return null
  return { costo: Number(data.costo), moneda: String(data.moneda) }
}

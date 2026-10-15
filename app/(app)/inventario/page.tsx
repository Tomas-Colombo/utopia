import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import {
  getInventarioResumen,
  listProductosConDetallePaginado,
  listProductosParaBuscador,
  PRODUCTOS_PAGE_SIZE,
} from '@/lib/dal/inventario/producto'
import { countProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import {
  listAlertaReposicion,
  listAlertaRotacionVencida,
} from '@/lib/dal/reportes/reportes'
import { hasModuleAccess } from '@/lib/dal/guard'
import { obtenerStockPorTenencia } from '@/lib/dal/revendedoras'
import type { StockPorTenenciaRow } from '@/lib/types/revendedoras'
import { AlertasReposicion } from './AlertasReposicion'
import { ProductosTableClient } from '@/components/inventario/ProductosTableClient'

/**
 * Home del módulo Inventario. Muestra el listado de productos directamente
 * (con un buscador único + filtros y paginación), más alertas (§L105),
 * cifras rápidas y accesos directos a los demás sub-módulos.
 */
export default async function InventarioHome(props: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string; tenencia?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1)
  const tieneModuloRevendedoras = hasModuleAccess(session, 'revendedoras', 'ver')

  const [
    { rows: productosPagina, total },
    catalogoBuscador,
    resumen,
    proveedoresActivos,
    categorias,
    alertasRepo,
    alertasRot,
    tenenciaList,
  ] = await Promise.all([
    listProductosConDetallePaginado({
      search: searchParams.q,
      idCategoria: searchParams.cat,
      page,
      pageSize: PRODUCTOS_PAGE_SIZE,
    }),
    listProductosParaBuscador(),
    getInventarioResumen(),
    countProveedoresActivos(),
    listCategoriasActivas(),
    listAlertaReposicion(),
    listAlertaRotacionVencida(),
    tieneModuloRevendedoras ? obtenerStockPorTenencia() : Promise.resolve([] as StockPorTenenciaRow[]),
  ])

  let tenenciaStockMap: Record<string, StockPorTenenciaRow> | null = null
  if (tieneModuloRevendedoras) {
    tenenciaStockMap = {}
    for (const t of tenenciaList) {
      tenenciaStockMap[t.id_producto] = t
    }
  }

  return (
    <>
      <Topbar
        title="Inventario"
        session={session}
        kpis={[
          { label: 'Stock disponible', value: resumen.stockDisponibleTotal.toLocaleString('es-AR') },
          { label: 'Productos activos', value: resumen.productosActivos.toString() },
          { label: 'Bajo mínimo', value: resumen.productosBajoMinimo.toString(), tone: resumen.productosBajoMinimo > 0 ? 'warn' : 'default' },
          { label: 'Proveedores', value: proveedoresActivos.toString() },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/inventario/ingresos/nuevo">
              <Button size="sm">Nuevo ingreso</Button>
            </Link>
            <Link href="/inventario/productos/nuevo">
              <Button size="sm">Nuevo producto</Button>
            </Link>
            <Link href="/inventario/categorias">
              <Button size="sm">Categorías</Button>
            </Link>
          </div>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        {/* Alertas — jerarquía visual §L105 */}
        <AlertasReposicion alertas={alertasRepo} />

        {alertasRot.length > 0 && (
          <section className="rounded-lg border border-warn bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-warn-ink">
                Rotación vencida
              </h3>
              <span className="text-xs text-muted">
                Evaluá devolver al proveedor · {alertasRot.length} ítem{alertasRot.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {alertasRot.slice(0, 6).map((a) => (
                <Link
                  key={a.id_item}
                  href={`/inventario/ficha/${encodeURIComponent(a.qr_code)}`}
                  className="flex items-center justify-between rounded-md bg-card-2 px-3 py-2 hover:bg-card-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.producto_nombre}</div>
                    <div className="text-xs text-muted truncate">{a.proveedor_nombre}</div>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <div className="font-mono">{a.dias_transcurridos}d</div>
                    <div className="text-warn-ink">+{a.dias_excedidos}</div>
                  </div>
                </Link>
              ))}
              {alertasRot.length > 6 && (
                <div className="md:col-span-2 text-center text-xs text-muted pt-1">
                  +{alertasRot.length - 6} más
                </div>
              )}
            </div>
          </section>
        )}

{/* Productos — buscador único (escáner + SKU) + tabla */}
        <section className="space-y-3">
          <h3 className="font-display text-lg">Productos</h3>
          <ProductosTableClient
            rows={productosPagina}
            catalogo={catalogoBuscador}
            categorias={categorias}
            initialSearch={searchParams.q ?? ''}
            initialCategoria={searchParams.cat ?? ''}
            page={page}
            pageSize={PRODUCTOS_PAGE_SIZE}
            total={total}
            basePath="/inventario"
            scanHref="/inventario/ficha"
            tenenciaStock={tenenciaStockMap}
            initialTenencia={tieneModuloRevendedoras ? (searchParams.tenencia ?? '') : ''}
          />
        </section>
      </main>
    </>
  )
}

import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
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
import { ProductosTableClient } from './productos/ProductosTableClient'

/**
 * Home del módulo Inventario. Muestra el listado de productos directamente
 * (con un buscador único + filtros y paginación), más alertas (§L105),
 * cifras rápidas y accesos directos a los demás sub-módulos.
 */
export default async function InventarioHome(props: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1)

  const [{ rows: productosPagina, total }, catalogoBuscador, resumen, proveedoresActivos, categorias, alertasRepo, alertasRot] =
    await Promise.all([
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
    ])

  return (
    <>
      <Topbar
        title="Inventario"
        session={session}
        actions={
          <Link href="/inventario/productos/nuevo">
            <Button size="sm">Nuevo producto</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        {/* Alertas — jerarquía visual §L105 */}
        {alertasRepo.length > 0 && (
          <section className="rounded-lg border-2 border-pink-strong bg-pink-bg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-pink-strong">
                ⚠ Reposición urgente
              </h3>
              <span className="text-sm font-mono text-pink-strong">
                {alertasRepo.length} producto{alertasRepo.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {alertasRepo.slice(0, 8).map((a) => (
                <Link
                  key={a.id_producto}
                  href={`/inventario?q=${encodeURIComponent(a.nombre)}`}
                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 hover:bg-card-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.nombre}</div>
                    {a.sku && <div className="text-xs font-mono text-muted">{a.sku}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs">{a.disponibles}/{a.stock_minimo}</span>
                    <Badge variant={a.severidad === 'sin_stock' ? 'danger' : 'warning'}>
                      {a.severidad === 'sin_stock' ? 'Sin stock' : 'Bajo'}
                    </Badge>
                  </div>
                </Link>
              ))}
              {alertasRepo.length > 8 && (
                <div className="md:col-span-2 text-center text-xs text-muted pt-1">
                  +{alertasRepo.length - 8} más
                </div>
              )}
            </div>
          </section>
        )}

        {alertasRot.length > 0 && (
          <section className="rounded-lg border border-terracota bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-terracota">
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
                    <div className="text-terracota">+{a.dias_excedidos}</div>
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

        {/* Métricas */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Stock disponible" value={resumen.stockDisponibleTotal.toLocaleString('es-AR')} />
          <Kpi label="Productos activos" value={resumen.productosActivos.toString()} />
          <Kpi
            label="Bajo mínimo"
            value={resumen.productosBajoMinimo.toString()}
            variant={resumen.productosBajoMinimo > 0 ? 'alert' : 'default'}
          />
          <Kpi label="Proveedores" value={proveedoresActivos.toString()} />
        </section>

        {/* Accesos a los demás sub-módulos — justo debajo de las métricas */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NavCard href="/inventario/categorias" label="Categorías" value={categorias.length} />
          <NavCard href="/inventario/ingresos" label="Ingresos" value="Ver" />
        </section>

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
          />
        </section>
      </main>
    </>
  )
}

function Kpi({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: string
  variant?: 'default' | 'alert'
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        variant === 'alert'
          ? 'border-pink-strong bg-pink-bg'
          : 'border-border bg-card'
      }`}
    >
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl text-text">{value}</div>
    </div>
  )
}

function NavCard({
  href,
  label,
  value,
}: {
  href: string
  label: string
  value: string | number
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
    >
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
    </Link>
  )
}

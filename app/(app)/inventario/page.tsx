import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { listProveedoresActivos } from '@/lib/dal/inventario/proveedor'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import {
  listAlertaReposicion,
  listAlertaRotacionVencida,
} from '@/lib/dal/reportes/reportes'

/**
 * Home del módulo Inventario. Cifras rápidas + alertas (§L105) + accesos
 * directos a sub-módulos.
 */
export default async function InventarioHome() {
  const session = await verifySession()
  const [productos, proveedores, categorias, alertasRepo, alertasRot] = await Promise.all([
    listProductosConDetalle({ soloActivos: true }),
    listProveedoresActivos(),
    listCategoriasActivas(),
    listAlertaReposicion(),
    listAlertaRotacionVencida(),
  ])

  const stockDisponibleTotal = productos.reduce((a, p) => a + p.stock_disponible, 0)
  const productosBajoMinimo = productos.filter(
    (p) => p.stock_disponible < p.stock_minimo,
  ).length

  const cards = [
    { href: '/inventario/productos', label: 'Productos', value: productos.length },
    { href: '/inventario/categorias', label: 'Categorías', value: categorias.length },
    { href: '/inventario/proveedores', label: 'Proveedores', value: proveedores.length },
    { href: '/inventario/ingresos', label: 'Ingresos', value: 'Ver' },
  ]

  return (
    <>
      <Topbar title="Inventario" session={session} />
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
                  href={`/inventario/productos?q=${encodeURIComponent(a.nombre)}`}
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

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Stock disponible" value={stockDisponibleTotal.toLocaleString('es-AR')} />
          <Kpi label="Productos activos" value={productos.length.toString()} />
          <Kpi
            label="Bajo mínimo"
            value={productosBajoMinimo.toString()}
            variant={productosBajoMinimo > 0 ? 'alert' : 'default'}
          />
          <Kpi label="Proveedores" value={proveedores.length.toString()} />
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <div className="text-sm text-muted">{c.label}</div>
              <div className="mt-1 font-display text-2xl">{c.value}</div>
            </Link>
          ))}
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-display text-lg mb-2">Escanear QR</h3>
          <p className="text-sm text-muted mb-3">
            Buscá un ítem por su código QR o ingresá el código manualmente.
          </p>
          <QuickScanLink />
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

function QuickScanLink() {
  return (
    <Link
      href="/inventario/ficha"
      className="inline-flex items-center gap-2 rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
    >
      Abrir escaneo
    </Link>
  )
}

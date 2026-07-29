import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import {
  getDashboardKpis,
  listAlertaReposicion,
  listAlertaRotacionVencida,
} from '@/lib/dal/reportes/reportes'

/**
 * Dashboard (§L99): "punto de entrada, no un módulo funcional nuevo".
 * KPIs rápidos + alertas críticas y menos-críticas (§L105 "distinta
 * jerarquía visual").
 */
export default async function DashboardPage() {
  const session = await verifySession()
  const [kpis, alertasReposicion, alertasRotacion] = await Promise.all([
    getDashboardKpis(),
    listAlertaReposicion(),
    listAlertaRotacionVencida(),
  ])

  return (
    <>
      <Topbar title="Dashboard" session={session} />
      <main className="flex-1 p-6 space-y-6">
        {/* Alertas críticas primero (jerarquía visual — §L105) */}
        {alertasReposicion.length > 0 && (
          <section className="rounded-lg border-2 border-pink-strong bg-pink-bg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg text-pink-strong">
                ⚠ Reposición urgente ({alertasReposicion.length})
              </h2>
              <Link href="/inventario/productos" className="text-sm text-pink-strong hover:underline">
                Ver todo
              </Link>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {alertasReposicion.slice(0, 10).map((a) => (
                <Link
                  key={a.id_producto}
                  href={`/inventario/productos?q=${encodeURIComponent(a.nombre)}`}
                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 hover:bg-card-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{a.nombre}</div>
                    {a.sku && <div className="text-xs font-mono text-muted">{a.sku}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {a.disponibles} / {a.stock_minimo}
                    </span>
                    <Badge variant={a.severidad === 'sin_stock' ? 'danger' : 'warning'}>
                      {a.severidad === 'sin_stock' ? 'Sin stock' : 'Bajo mínimo'}
                    </Badge>
                  </div>
                </Link>
              ))}
              {alertasReposicion.length > 10 && (
                <div className="text-center text-xs text-muted pt-2">
                  +{alertasReposicion.length - 10} más
                </div>
              )}
            </div>
          </section>
        )}

        {/* Rotación vencida (jerarquía menor) */}
        {alertasRotacion.length > 0 && (
          <section className="rounded-lg border border-terracota bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg text-terracota">
                Rotación vencida ({alertasRotacion.length})
              </h2>
              <span className="text-xs text-muted">
                Evaluá devolver al proveedor
              </span>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {alertasRotacion.slice(0, 8).map((a) => (
                <Link
                  key={a.id_item}
                  href={`/inventario/ficha/${encodeURIComponent(a.qr_code)}`}
                  className="flex items-center justify-between rounded-md bg-card-2 px-3 py-2 hover:bg-card-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{a.producto_nombre}</div>
                    <div className="text-xs text-muted">
                      {a.proveedor_nombre} · <span className="font-mono">{a.qr_code}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono">{a.dias_transcurridos} días en stock</div>
                    <div className="text-terracota">+{a.dias_excedidos} sobre plazo</div>
                  </div>
                </Link>
              ))}
              {alertasRotacion.length > 8 && (
                <div className="text-center text-xs text-muted pt-2">
                  +{alertasRotacion.length - 8} más
                </div>
              )}
            </div>
          </section>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi
            label="Ventas hoy"
            value={kpis.ventas_hoy.toLocaleString('es-AR')}
            sub={`$ ${kpis.facturado_hoy.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          />
          <Kpi
            label="Ventas 30 días"
            value={kpis.ventas_30d.toLocaleString('es-AR')}
            sub={`$ ${kpis.facturado_30d.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          />
          <Kpi
            label="Reservas activas"
            value={kpis.reservas_activas.toLocaleString('es-AR')}
            sub={
              kpis.reservas_vencidas_sin_purgar > 0
                ? `${kpis.reservas_vencidas_sin_purgar} vencidas sin purgar`
                : undefined
            }
            variant={kpis.reservas_vencidas_sin_purgar > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Rendiciones pendientes"
            value={kpis.rendiciones_pendientes.toLocaleString('es-AR')}
            sub={
              kpis.monto_rendiciones_pendientes > 0
                ? `$ ${kpis.monto_rendiciones_pendientes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                : undefined
            }
            variant={kpis.rendiciones_pendientes > 0 ? 'alert' : 'default'}
          />
        </section>

        {/* Accesos rápidos */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { href: '/ventas/nueva', label: 'Nueva venta' },
            { href: '/inventario/ficha', label: 'Escanear ítem' },
            { href: '/rendiciones/nueva', label: 'Generar rendición' },
            { href: '/reportes', label: 'Ver reportes' },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="rounded-lg border border-border bg-card p-4 text-center hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <div className="font-display">{a.label}</div>
            </Link>
          ))}
        </section>
      </main>
    </>
  )
}

function Kpi({
  label,
  value,
  sub,
  variant = 'default',
}: {
  label: string
  value: string
  sub?: string
  variant?: 'default' | 'alert'
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        variant === 'alert' ? 'border-pink-strong bg-pink-bg' : 'border-border bg-card'
      }`}
    >
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl text-text">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import {
  getReporteFinanciero,
  getRotacion,
  listGananciaPorProducto,
  listPerfilProveedor,
} from '@/lib/dal/reportes/reportes'
import { ReportesPeriodoForm } from './ReportesPeriodoForm'

/**
 * §L112: "pantalla que reúne las métricas necesarias para controlar el
 * negocio completo, no solo ventas". Vista consolidada:
 *  - RF-13 financiero por período + impacto de descuentos (§L120)
 *  - RF-12 rotación por producto
 *  - RF-11 perfil de proveedores
 *  - RF-07 ganancia por producto
 */
export default async function ReportesPage(props: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams

  // Default: mes calendario en curso
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59)

  const desdeISO = sp.desde ? new Date(sp.desde).toISOString() : inicioMes.toISOString()
  const hastaISO = sp.hasta
    ? new Date(new Date(sp.hasta).setHours(23, 59, 59, 999)).toISOString()
    : finMes.toISOString()

  const [financiero, rotacion, proveedores, ganancia] = await Promise.all([
    getReporteFinanciero({ desde: desdeISO, hasta: hastaISO }),
    getRotacion({ desde: desdeISO, hasta: hastaISO }),
    listPerfilProveedor(),
    listGananciaPorProducto(),
  ])

  const impacto = financiero.impacto_descuentos
  const impactoPct =
    financiero.ganancia_bruta_esperada > 0
      ? (impacto / financiero.ganancia_bruta_esperada) * 100
      : 0

  return (
    <>
      <Topbar title="Reportes" session={session} />
      <main className="flex-1 p-6 space-y-6">
        <ReportesPeriodoForm
          desde={sp.desde ?? inicioMes.toISOString().slice(0, 10)}
          hasta={sp.hasta ?? finMes.toISOString().slice(0, 10)}
        />

        {/* ─── Financiero (RF-13 + impacto descuentos) ────────────── */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="font-display text-lg">Financiero del período</h2>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Ingresos" value={fmtMoney(financiero.ingresos_totales)} />
            <Kpi label="Costo mercadería" value={fmtMoney(financiero.costo_mercaderia)} muted />
            <Kpi label="A proveedores" value={fmtMoney(financiero.monto_a_proveedores)} muted />
            <Kpi label="Gastos operativos" value={fmtMoney(financiero.gastos_totales)} muted />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Kpi
              label="Ganancia bruta (real)"
              value={fmtMoney(financiero.ganancia_bruta_real)}
              highlight
            />
            <Kpi
              label="Ganancia bruta (esperada)"
              value={fmtMoney(financiero.ganancia_bruta_esperada)}
              muted
              sub="Si no hubieran habido descuentos"
            />
            <Kpi
              label="Ganancia neta"
              value={fmtMoney(financiero.ganancia_neta)}
              highlight
              sub="bruta real − gastos"
            />
          </div>

          {/* Impacto descuentos §L120 */}
          <div
            className={`rounded-md border p-3 text-sm ${
              impacto > 0
                ? 'border-terracota bg-card-2'
                : impacto < 0
                  ? 'border-success bg-card-2'
                  : 'border-border bg-card-2'
            }`}
          >
            <div className="font-mono text-xs uppercase text-muted mb-1">
              Impacto de descuentos
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`font-display text-lg ${
                impacto > 0 ? 'text-terracota' : impacto < 0 ? 'text-success' : ''
              }`}>
                {impacto > 0 ? '−' : ''}{fmtMoney(Math.abs(impacto))}
              </span>
              {impactoPct !== 0 && (
                <span className="text-sm text-muted">
                  ({impacto > 0 ? '−' : '+'}{Math.abs(impactoPct).toFixed(1)}% vs esperado)
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              Diferencia entre lo que habrías ganado a precio de lista y lo que
              efectivamente ganaste después de aplicar descuentos/recargos.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs text-muted pt-2 border-t border-border">
            <div>
              <div className="uppercase font-mono">Ventas</div>
              <div className="text-text text-base">{financiero.cantidad_ventas}</div>
            </div>
            <div>
              <div className="uppercase font-mono">Líneas</div>
              <div className="text-text text-base">{financiero.cantidad_lineas}</div>
            </div>
            <div>
              <div className="uppercase font-mono">Ticket promedio</div>
              <div className="text-text text-base">{fmtMoney(financiero.ticket_promedio)}</div>
            </div>
          </div>
        </section>

        {/* ─── Rotación (RF-12) ─────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-display text-lg">Rotación por producto (período)</h2>
          </div>
          {rotacion.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              Sin datos para este período.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Unidades</th>
                  <th className="px-4 py-3 text-right">Vendido</th>
                  <th className="px-4 py-3 text-right">Ganancia</th>
                  <th className="px-4 py-3 text-right">Ticket prom.</th>
                  <th className="px-4 py-3">Última venta</th>
                </tr>
              </thead>
              <tbody>
                {rotacion.slice(0, 50).map((r) => (
                  <tr key={r.id_producto} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.nombre}</div>
                      {r.sku && <div className="text-xs font-mono text-muted">{r.sku}</div>}
                    </td>
                    <td className="px-4 py-3">{r.categoria_nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.unidades_vendidas}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(r.monto_vendido)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={r.monto_ganancia < 0 ? 'text-pink-strong' : ''}>
                        {fmtMoney(r.monto_ganancia)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {fmtMoney(r.ticket_promedio)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.ultima_venta ? new Date(r.ultima_venta).toLocaleDateString('es-AR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── Perfil proveedor (RF-11) ─────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-display text-lg">Perfil de proveedores</h2>
          </div>
          {proveedores.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Sin proveedores activos.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 text-right">Stock consig.</th>
                  <th className="px-4 py-3 text-right">Consig. abiertas</th>
                  <th className="px-4 py-3 text-right">Pendiente rendir</th>
                  <th className="px-4 py-3 text-right">Rendido histórico</th>
                  <th className="px-4 py-3 text-right">Rendic. impagas</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p) => (
                  <tr key={p.id_proveedor} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.nombre}</div>
                      <div className="text-xs text-muted capitalize">{p.tipo}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{p.items_disponibles}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.consignaciones_activas > 0 ? (
                        <Badge variant="warning">{p.consignaciones_activas}</Badge>
                      ) : (
                        p.consignaciones_activas
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.monto_pendiente_rendicion > 0 ? (
                        <span className="text-terracota font-semibold">
                          {fmtMoney(p.monto_pendiente_rendicion)}
                        </span>
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                      {p.lineas_pendientes_rendicion > 0 && (
                        <div className="text-xs text-muted">
                          {p.lineas_pendientes_rendicion} líneas
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {fmtMoney(p.monto_rendido_historico)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.rendiciones_pendientes_pago > 0 ? (
                        <Badge variant="danger">{p.rendiciones_pendientes_pago}</Badge>
                      ) : (
                        p.rendiciones_pendientes_pago
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── Ganancia por producto (RF-07) ────────────────────────── */}
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-display text-lg">Ganancia proyectada por producto (RF-07)</h2>
          </div>
          {ganancia.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Sin productos activos.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  <th className="px-4 py-3 text-right">Ganancia u.</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {ganancia.slice(0, 50).map((g) => (
                  <tr key={g.id_producto} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{g.nombre}</div>
                      {g.sku && <div className="text-xs font-mono text-muted">{g.sku}</div>}
                    </td>
                    <td className="px-4 py-3">{g.categoria_nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {g.costo_vigente != null ? fmtMoney(g.costo_vigente) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {g.precio_venta != null ? fmtMoney(g.precio_venta) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {g.ganancia_unitaria != null ? fmtMoney(g.ganancia_unitaria) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {g.margen_pct != null ? `${g.margen_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  )
}

function fmtMoney(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function Kpi({
  label,
  value,
  sub,
  muted,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? 'border-accent-pink bg-card' : 'border-border bg-card-2'
      }`}
    >
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className={`mt-1 font-display text-xl ${muted ? 'text-muted' : 'text-text'}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

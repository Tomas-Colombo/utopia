import { Topbar } from '@/components/shell/Topbar'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import {
  getReporteFinanciero,
  getRotacion,
  listPerfilProveedor,
} from '@/lib/dal/reportes/reportes'
import { ReportesPeriodoForm } from './ReportesPeriodoForm'
import { RotacionTable } from './RotacionTable'
import { PerfilProveedoresTable } from './PerfilProveedoresTable'

/**
 * §L112: "pantalla que reúne las métricas necesarias para controlar el
 * negocio completo, no solo ventas". Vista consolidada:
 *  - RF-13 financiero por período + impacto de descuentos (§L120)
 *  - RF-12 rotación por producto
 *  - RF-11 perfil de proveedores
 *
 * RF-07 (ganancia proyectada por producto) vive ahora en /precios.
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

  const [financiero, rotacion, proveedores] = await Promise.all([
    getReporteFinanciero({ desde: desdeISO, hasta: hastaISO }),
    getRotacion({ desde: desdeISO, hasta: hastaISO }),
    listPerfilProveedor(),
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
            <Kpi label="Ingresos" value={fmtMoney(financiero.ingresos_totales)} variant="nested" />
            <Kpi label="Costo mercadería" value={fmtMoney(financiero.costo_mercaderia)} variant="nested" tone="muted" />
            <Kpi label="A proveedores" value={fmtMoney(financiero.monto_a_proveedores)} variant="nested" tone="muted" />
            <Kpi label="Gastos operativos" value={fmtMoney(financiero.gastos_totales)} variant="nested" tone="muted" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Kpi
              label="Ganancia bruta (real)"
              value={fmtMoney(financiero.ganancia_bruta_real)}
              variant="highlight"
            />
            <Kpi
              label="Ganancia bruta (esperada)"
              value={fmtMoney(financiero.ganancia_bruta_esperada)}
              variant="nested"
              tone="muted"
              sub="Si no hubieran habido descuentos"
            />
            <Kpi
              label="Ganancia neta"
              value={fmtMoney(financiero.ganancia_neta)}
              variant="highlight"
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
        <section className="space-y-3">
          <h2 className="font-display text-lg">Rotación por producto (período)</h2>
          <RotacionTable rows={rotacion} />
        </section>

        {/* ─── Perfil proveedor (RF-11) ─────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-display text-lg">Perfil de proveedores</h2>
          <PerfilProveedoresTable rows={proveedores} />
        </section>

      </main>
    </>
  )
}

function fmtMoney(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}


import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listGastos, listPresupuestoMes } from '@/lib/dal/gastos/gasto'
import type { CategoriaGastoStatus } from '@/lib/types/rendiciones'

const ALERTA_VARIANT: Record<CategoriaGastoStatus['alerta'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  cerca: 'warning',
  excedido: 'danger',
  sin_control: 'neutral',
}
const ALERTA_LABEL: Record<CategoriaGastoStatus['alerta'], string> = {
  ok: 'OK',
  cerca: 'Cerca del límite',
  excedido: 'Excedido',
  sin_control: 'Sin presupuesto',
}

export default async function GastosPage() {
  const session = await verifySession()
  const [gastos, presupuestos] = await Promise.all([
    listGastos({ limit: 100 }),
    listPresupuestoMes(),
  ])

  const totalMes = presupuestos.reduce((a, p) => a + p.gastado_mes, 0)
  const excedidos = presupuestos.filter((p) => p.alerta === 'excedido').length
  const cerca = presupuestos.filter((p) => p.alerta === 'cerca').length

  return (
    <>
      <Topbar
        title="Gastos"
        session={session}
        actions={
          <div className="flex gap-2">
            <Link href="/gastos/presupuestos">
              <Button size="sm" variant="secondary">Presupuestos</Button>
            </Link>
            <Link href="/gastos/nuevo">
              <Button size="sm">Nuevo gasto</Button>
            </Link>
          </div>
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi
            label="Gastado este mes"
            value={`$ ${totalMes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          />
          <Kpi
            label="Categorías excedidas"
            value={excedidos.toString()}
            variant={excedidos > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Cerca del límite"
            value={cerca.toString()}
            variant={cerca > 0 ? 'alert' : 'default'}
          />
          <Kpi label="Categorías activas" value={presupuestos.length.toString()} />
        </section>

        {/* Presupuestos por categoría */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Presupuesto del mes (RF-10)</h3>
            <Link href="/gastos/presupuestos" className="text-sm text-pink-strong hover:underline">
              Ajustar presupuestos
            </Link>
          </div>
          {presupuestos.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              Sin categorías de gasto configuradas.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Presupuesto</th>
                  <th className="px-4 py-3 text-right">Gastado</th>
                  <th className="px-4 py-3 text-right">Restante</th>
                  <th className="px-4 py-3">%</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {presupuestos.map((p) => {
                  const pctClamp = Math.min(p.gastado_pct ?? 0, 100)
                  return (
                    <tr key={p.id_categoria_gasto} className="border-b border-border-2">
                      <td className="px-4 py-3 font-medium">{p.nombre}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.presupuesto_mensual != null
                          ? `$ ${p.presupuesto_mensual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : <span className="text-muted-2">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        $ {p.gastado_mes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.restante != null
                          ? (p.restante < 0
                              ? <span className="text-pink-strong">-$ {Math.abs(p.restante).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                              : `$ ${p.restante.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
                          : <span className="text-muted-2">—</span>}
                      </td>
                      <td className="px-4 py-3 w-40">
                        {p.gastado_pct != null ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded bg-card-3 overflow-hidden">
                              <div
                                className={
                                  p.alerta === 'excedido' ? 'h-full bg-pink-strong' :
                                  p.alerta === 'cerca' ? 'h-full bg-terracota' :
                                  'h-full bg-success'
                                }
                                style={{ width: `${pctClamp}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{p.gastado_pct}%</span>
                          </div>
                        ) : (
                          <span className="text-muted-2 text-xs">Sin control</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ALERTA_VARIANT[p.alerta]}>
                          {ALERTA_LABEL[p.alerta]}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Últimos gastos */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-lg">Últimos gastos registrados</h3>
          </div>
          {gastos.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              Sin gastos registrados aún.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Comprobante</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id_gasto} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      {new Date(g.fecha).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3">{g.categoria?.nombre ?? '—'}</td>
                    <td className="px-4 py-3">{g.descripcion}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {g.comprobante_ref ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      $ {Number(g.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
        variant === 'alert' ? 'border-pink-strong bg-pink-bg' : 'border-border bg-card'
      }`}
    >
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl text-text">{value}</div>
    </div>
  )
}

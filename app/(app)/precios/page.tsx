import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listReglasPrecio } from '@/lib/dal/precios/regla'
import { listControlDePrecios } from '@/lib/dal/precios/resolucion'

export default async function PreciosHome() {
  const session = await verifySession()
  const [reglas, control] = await Promise.all([
    listReglasPrecio(),
    listControlDePrecios(),
  ])

  const desactualizados = control.filter((p) => p.precio_venta_desactualizado).length
  const sinPrecio = control.filter((p) => p.precio_venta == null).length
  const conRegla = control.filter((p) => p.regla_margen_nombre != null).length

  return (
    <>
      <Topbar title="Precios" session={session} />
      <main className="flex-1 p-6 space-y-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Reglas activas" value={reglas.length.toString()} />
          <Kpi
            label="Precios desactualizados"
            value={desactualizados.toString()}
            variant={desactualizados > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Sin precio"
            value={sinPrecio.toString()}
            variant={sinPrecio > 0 ? 'alert' : 'default'}
          />
          <Kpi label="Con margen aplicado" value={conRegla.toString()} />
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link
            href="/precios/reglas"
            className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <div className="text-sm text-muted">Configurar</div>
            <div className="mt-1 font-display text-xl">Reglas de precios</div>
            <p className="mt-2 text-sm text-muted">
              Margen, descuentos, recargos por forma de pago. Cascada: producto &gt; categoría &gt; proveedor &gt; global.
            </p>
          </Link>
          <Link
            href="/precios/control"
            className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <div className="text-sm text-muted">Ejecutar</div>
            <div className="mt-1 font-display text-xl">Control de precios</div>
            <p className="mt-2 text-sm text-muted">
              Ver productos desactualizados y aplicar recálculo (individual o masivo).
            </p>
          </Link>
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

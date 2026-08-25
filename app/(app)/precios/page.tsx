import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listReglasPrecio } from '@/lib/dal/precios/regla'
import { getPreciosResumen } from '@/lib/dal/precios/resolucion'
import { listGananciaPorProducto } from '@/lib/dal/reportes/reportes'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { listProductosParaBuscador } from '@/lib/dal/inventario/producto'
import { normalizar } from '@/lib/inventario/producto-match'
import { Kpi } from '@/components/ui/Kpi'
import { GananciaProyectadaClient } from './GananciaProyectadaClient'

const GANANCIA_PAGE_SIZE = 20

export default async function PreciosHome(props: {
  searchParams: Promise<{ gq?: string; gcat?: string; gpage?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams
  const page = Math.max(1, Number.parseInt(sp.gpage ?? '1', 10) || 1)

  const [reglas, resumen, ganancia, categorias, catalogo] = await Promise.all([
    listReglasPrecio(),
    getPreciosResumen(),
    listGananciaPorProducto(),
    listCategoriasActivas(),
    listProductosParaBuscador(),
  ])

  const { desactualizados, sinPrecio, conRegla } = resumen

  const term = normalizar(sp.gq ?? '')
  const filtradas = ganancia.filter((g) => {
    if (sp.gcat && g.id_categoria !== sp.gcat) return false
    if (term) {
      const okNombre = normalizar(g.nombre).includes(term)
      const okSku = g.sku ? normalizar(g.sku).includes(term) : false
      if (!okNombre && !okSku) return false
    }
    return true
  })
  const total = filtradas.length
  const from = (page - 1) * GANANCIA_PAGE_SIZE
  const pageRows = filtradas.slice(from, from + GANANCIA_PAGE_SIZE)

  return (
    <>
      <Topbar title="Precios y Cuentas" session={session} />
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

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
            href="/precios/cuentas"
            className="rounded-lg border border-border bg-card p-5 hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <div className="text-sm text-muted">Configurar</div>
            <div className="mt-1 font-display text-xl">Cuentas de cobro</div>
            <p className="mt-2 text-sm text-muted">
              Dónde entra la plata: caja, banco, billetera virtual. Y el
              tarifario de cada una: cuánto retiene el procesador y en cuántos
              días acredita.
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

        <section className="space-y-3">
          <h2 className="font-display text-lg">Ganancia proyectada por producto</h2>
          <GananciaProyectadaClient
            rows={pageRows}
            catalogo={catalogo}
            categorias={categorias}
            initialSearch={sp.gq ?? ''}
            initialCategoria={sp.gcat ?? ''}
            page={page}
            pageSize={GANANCIA_PAGE_SIZE}
            total={total}
          />
        </section>
      </main>
    </>
  )
}


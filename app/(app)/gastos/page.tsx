import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import {
  listCategoriasGasto,
  listGastosPaginado,
  listPresupuestoMes,
  type GastosOrden,
} from '@/lib/dal/gastos/gasto'
import { PresupuestosMesTable } from './PresupuestosMesTable'
import { GastosTableClient } from './GastosTableClient'

const PAGE_SIZE = 20
const ORDENES: readonly GastosOrden[] = ['fecha_desc', 'fecha_asc', 'monto_desc', 'monto_asc'] as const

function parseOrden(v: string | undefined): GastosOrden {
  return (ORDENES as readonly string[]).includes(v ?? '') ? (v as GastosOrden) : 'fecha_desc'
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const desde = typeof params.desde === 'string' ? params.desde : ''
  const hasta = typeof params.hasta === 'string' ? params.hasta : ''
  const cat = typeof params.cat === 'string' ? params.cat : ''
  const orden = parseOrden(typeof params.orden === 'string' ? params.orden : undefined)
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const session = await verifySession()
  const [gastosPage, presupuestos, categorias] = await Promise.all([
    listGastosPaginado({
      desde: desde || undefined,
      hasta: hasta || undefined,
      idCategoria: cat || undefined,
      orden,
      page,
      pageSize: PAGE_SIZE,
    }),
    listPresupuestoMes(),
    listCategoriasGasto({ soloActivas: true }),
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
            value={`$ ${totalMes.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
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
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="border-b border-border px-4 py-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Presupuestos del mes</h3>
            <Link href="/gastos/presupuestos" className="text-sm text-pink-strong hover:underline">
              Ajustar presupuestos
            </Link>
          </div>
          <PresupuestosMesTable rows={presupuestos} />
        </section>

        {/* Últimos gastos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Últimos gastos registrados</h3>
          </div>
          <GastosTableClient
            rows={gastosPage.rows}
            categorias={categorias.map((c) => ({ id: c.id_categoria_gasto, nombre: c.nombre }))}
            initialDesde={desde}
            initialHasta={hasta}
            initialCategoria={cat}
            initialOrden={orden}
            page={page}
            pageSize={PAGE_SIZE}
            total={gastosPage.total}
          />
        </section>
      </main>
    </>
  )
}

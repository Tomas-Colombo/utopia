import { Topbar } from '@/components/shell/Topbar'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import { listDeudores } from '@/lib/dal/cuotas/cuota'
import {
  FILTRO_ESTADO_CUOTAS_LABEL,
  type FiltroEstadoCuotas,
} from '@/lib/types/ventas'
import { CuotasView } from './CuotasView'

const PAGE_SIZE = 25

function parseEstado(raw: string | undefined): FiltroEstadoCuotas {
  return raw && raw in FILTRO_ESTADO_CUOTAS_LABEL
    ? (raw as FiltroEstadoCuotas)
    : 'con_deuda'
}

/**
 * Panel de control de la deuda: quién debe, cuánto y desde cuándo.
 *
 * Una fila por CLIENTE, no por cuota. Alguien que compró tres veces en cuotas
 * ocupaba dieciocho filas y no había forma de leer cuánto debe en total, que
 * es exactamente la pregunta que se le hace a esta pantalla.
 *
 * `hoy` se calcula UNA vez y se pasa a todo lo que dependa de él. Si cada
 * consulta preguntara la fecha por su cuenta, una request a caballo de la
 * medianoche mostraría un total que no cierra contra las filas.
 */
export default async function CuotasPage(props: {
  searchParams: Promise<{ estado?: string; q?: string; page?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams

  const estado = parseEstado(sp.estado)
  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const hoy = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local

  const { rows, resumen } = await listDeudores({ estado, search: sp.q, hoy })

  // La paginación es sobre los clientes YA agrupados: con `range()` en la
  // consulta un cliente podría quedar partido entre dos páginas y sus totales
  // saldrían mal en las dos.
  const desde = (page - 1) * PAGE_SIZE
  const pagina = rows.slice(desde, desde + PAGE_SIZE)

  return (
    <>
      <Topbar title="Cuotas" session={session} />
      <main className="flex-1 space-y-6 p-6">
        {/* KPIs del conjunto FILTRADO, no del total global: un contador que
            ignora el filtro activo miente sobre lo que se está mirando. */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="A cobrar" value={money(resumen.aCobrar)} variant="highlight" />
          <Kpi label="Vence este mes" value={money(resumen.venceEsteMes)} variant="nested" />
          <Kpi
            label="Vencido"
            value={money(resumen.vencido)}
            variant="nested"
            tone={resumen.vencido > 0 ? undefined : 'muted'}
            sub={resumen.vencido > 0 ? 'Requiere gestión' : undefined}
          />
          <Kpi
            label="Clientes con deuda"
            value={String(resumen.clientesConDeuda)}
            variant="nested"
            tone="muted"
          />
        </section>

        <CuotasView
          rows={pagina}
          estado={estado}
          initialSearch={sp.q ?? ''}
          page={page}
          pageSize={PAGE_SIZE}
          total={rows.length}
          hoy={hoy}
        />
      </main>
    </>
  )
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

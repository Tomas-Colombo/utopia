import { Topbar } from '@/components/shell/Topbar'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import { listDeudores } from '@/lib/dal/cuotas/cuota'
import { hoyISO } from '@/lib/utils/hoy'
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
  const hoy = hoyISO()

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
            ignora el filtro activo miente sobre lo que se está mirando.

            El orden es el de urgencia, de izquierda a derecha: lo que ya está
            vencido, lo que vence hoy, lo que viene, y el total. "Vencido"
            arranca la fila porque es lo único que ya salió mal. */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* Caja de alerta cuando hay mora: el mismo número en gris se lee
              como un dato más de la fila. */}
          <Kpi
            label="Vencido"
            value={money(resumen.vencido)}
            variant={resumen.vencido > 0 ? 'alert' : 'nested'}
            tone={resumen.vencido > 0 ? undefined : 'muted'}
            sub={
              resumen.vencido > 0
                ? `${resumen.clientesVencidos} cliente${resumen.clientesVencidos === 1 ? '' : 's'} · requiere gestión`
                : 'Nadie atrasado'
            }
          />
          {/* Vencer hoy todavía se puede cobrar: es aviso, no alarma. Pero
              tiene que VERSE, que es justamente lo que faltaba: hasta ahora
              una cuota que vencía hoy no aparecía en ningún indicador. */}
          <Kpi
            label="Vence hoy"
            value={money(resumen.venceHoy)}
            variant={resumen.venceHoy > 0 ? 'highlight' : 'nested'}
            tone={resumen.venceHoy > 0 ? undefined : 'muted'}
            sub={
              resumen.venceManana > 0
                ? `Mañana ${money(resumen.venceManana)}`
                : 'Mañana no vence nada'
            }
          />
          <Kpi label="Vence este mes" value={money(resumen.venceEsteMes)} variant="nested" />
          <Kpi
            label="A cobrar"
            value={money(resumen.aCobrar)}
            variant="nested"
            sub={`${resumen.clientesConDeuda} cliente${resumen.clientesConDeuda === 1 ? '' : 's'} con deuda`}
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

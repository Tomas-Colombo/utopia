import { Topbar } from '@/components/shell/Topbar'
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
      <Topbar
        title="Cuotas"
        session={session}
        kpis={[
          {
            label: 'Vencido',
            value: money(resumen.vencido),
            tone: resumen.vencido > 0 ? 'warn' : 'default',
            sub:
              resumen.vencido > 0
                ? `${resumen.clientesVencidos} cliente${resumen.clientesVencidos === 1 ? '' : 's'} · requiere gestión`
                : 'Nadie atrasado',
          },
          {
            label: 'Vence hoy',
            value: money(resumen.venceHoy),
            sub:
              resumen.venceManana > 0
                ? `Mañana ${money(resumen.venceManana)}`
                : 'Mañana no vence nada',
          },
          { label: 'Vence este mes', value: money(resumen.venceEsteMes) },
          {
            label: 'A cobrar',
            value: money(resumen.aCobrar),
            sub: `${resumen.clientesConDeuda} cliente${resumen.clientesConDeuda === 1 ? '' : 's'} con deuda`,
          },
        ]}
      />
      <main className="flex-1 space-y-6 p-6">
        {/* Los KPIs de la franja son del conjunto FILTRADO, no del total global. */}

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

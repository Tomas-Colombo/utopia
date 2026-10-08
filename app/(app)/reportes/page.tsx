import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { hasModuleAccess } from '@/lib/dal/guard'
import {
  getContextoPeriodo,
  getFlujo,
  getPosicion,
  getResultados,
  getSerieMensual,
} from '@/lib/dal/reportes/finanzas'
import { ReportesPeriodoForm } from './ReportesPeriodoForm'
import { inicioDelDia, inicioDelDiaSiguiente, periodoAnterior } from '@/lib/fechas'
import { searchParamsReportesSchema } from '@/lib/validation/reportes'

import { BloqueResumen } from '@/components/reportes/BloqueResumen'
import { BloqueGanancia } from '@/components/reportes/BloqueGanancia'
import { BloqueMovimientoPlata } from '@/components/reportes/BloqueMovimientoPlata'
import { GraficoTendencia } from '@/components/reportes/GraficoTendencia'
import { BloqueCobrar } from '@/components/reportes/BloqueCobrar'
import { BloqueError } from '@/components/reportes/BloqueError'

async function tryFetch<T>(promise: Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const data = await promise
    return { ok: true, data }
  } catch {
    return { ok: false }
  }
}

export default async function ReportesPage(props: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const session = await verifySession()
  const sp = await props.searchParams

  const contexto = await getContextoPeriodo()
  if (!contexto) throw new Error('No se pudo obtener el contexto del período')

  const parsed = searchParamsReportesSchema.safeParse(sp)
  
  const desde = parsed.success ? parsed.data.desde : contexto.mes_desde
  const hasta = parsed.success ? parsed.data.hasta : contexto.mes_hasta
  const prev = periodoAnterior(desde, hasta)

  const puedeVerVentas = hasModuleAccess(session, 'ventas', 'ver')
  const tieneGastos = session.modulosHabilitados.includes('gastos')

  const [
    resultadosReq, resultadosPrevReq,
    flujoReq, flujoPrevReq,
    posicionReq, serieReq
  ] = await Promise.all([
    tryFetch(getResultados(inicioDelDia(desde), inicioDelDiaSiguiente(hasta))),
    tryFetch(getResultados(inicioDelDia(prev.desde), inicioDelDiaSiguiente(prev.hasta))),
    tryFetch(getFlujo(inicioDelDia(desde), inicioDelDiaSiguiente(hasta))),
    tryFetch(getFlujo(inicioDelDia(prev.desde), inicioDelDiaSiguiente(prev.hasta))),
    tryFetch(getPosicion()),
    tryFetch(getSerieMensual(inicioDelDiaSiguiente(hasta), 12)),
  ])

  return (
    <>
      <Topbar title="Tablero financiero" session={session} />
      <main className="flex-1 p-6 space-y-6">
        <ReportesPeriodoForm desde={desde} hasta={hasta} />
        
        {puedeVerVentas && (
          resultadosReq.ok && flujoReq.ok ? (
            <BloqueResumen
              resultados={resultadosReq.data!}
              resultadosPrev={resultadosPrevReq.ok ? resultadosPrevReq.data : null}
              flujo={flujoReq.data!}
              flujoPrev={flujoPrevReq.ok ? flujoPrevReq.data : null}
              posicion={posicionReq.ok ? posicionReq.data : null}
              tieneGastos={tieneGastos}
            />
          ) : (
            <BloqueError />
          )
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {resultadosReq.ok ? (
            <BloqueGanancia resultados={resultadosReq.data!} tieneGastos={tieneGastos} />
          ) : (
            <BloqueError />
          )}

          {flujoReq.ok ? (
            <BloqueMovimientoPlata flujo={flujoReq.data!} tieneGastos={tieneGastos} />
          ) : (
            <BloqueError />
          )}
        </div>

        {serieReq.ok ? (
          <GraficoTendencia serie={serieReq.data!} tieneGastos={tieneGastos} />
        ) : (
          <BloqueError />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {posicionReq.ok ? (
            <div className="md:col-span-1 xl:col-span-1">
              <BloqueCobrar porCobrar={posicionReq.data?.por_cobrar ?? null} puedeVerVentas={puedeVerVentas} />
            </div>
          ) : (
            <div className="md:col-span-1 xl:col-span-1">
              <BloqueError />
            </div>
          )}
          {/* Espacio para BloqueMercaderia y Proveedores en Slice 13 */}
        </div>
      </main>
    </>
  )
}



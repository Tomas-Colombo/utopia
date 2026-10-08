import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import {
  getContextoPeriodo,
  getFlujo,
  getPosicion,
  getResultados,
  getSerieMensual,
} from '@/lib/dal/reportes/finanzas'
import { ReportesPeriodoForm } from './ReportesPeriodoForm'
import { inicioDelDia, inicioDelDiaSiguiente } from '@/lib/fechas'

import { searchParamsReportesSchema } from '@/lib/validation/reportes'

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

  // TODO: Add blocks in Slice 12
  // Fetch data
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [resultados, flujo, posicion, serie] = await Promise.all([
    getResultados(inicioDelDia(desde), inicioDelDiaSiguiente(hasta)),
    getFlujo(inicioDelDia(desde), inicioDelDiaSiguiente(hasta)),
    getPosicion(),
    getSerieMensual(inicioDelDiaSiguiente(hasta), 12),
  ])

  return (
    <>
      <Topbar title="Tablero financiero" session={session} />
      <main className="flex-1 p-6 space-y-6">
        <ReportesPeriodoForm desde={desde} hasta={hasta} />
        
        {/* Slices posteriores llenarán los bloques */}
        <section className="space-y-4">
          <p className="text-muted-foreground">Datos cargados para {desde} al {hasta}. Bloques en construcción.</p>
        </section>
      </main>
    </>
  )
}



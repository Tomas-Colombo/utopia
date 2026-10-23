import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora, previewLiquidacion } from '@/lib/dal/revendedoras'
import { esFechaValida } from '@/lib/fechas'
import { NuevaLiquidacionView } from './NuevaLiquidacionView'

export default async function NuevaLiquidacionPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'liquidar')

  const { id } = await props.params
  const sp = await props.searchParams

  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  // Default al mes en curso
  const hoy = new Date()
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  const defaultDesde = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const defaultHasta = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)

  const desde = esFechaValida(sp.desde) ? sp.desde! : defaultDesde
  const hasta = esFechaValida(sp.hasta) ? sp.hasta! : defaultHasta

  const prevRes = await previewLiquidacion({
    id_revendedora: id,
    desde,
    hasta,
  })

  const preview = prevRes.ok
    ? prevRes.data
    : {
        cantidad_lineas: 0,
        monto_vendido: 0,
        porcentaje_resuelto: 0,
        monto_comision: 0,
        monto_a_cobrar: 0,
        lineas: [],
      }

  return (
    <>
      <Topbar
        title={`Nueva liquidación · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}/liquidaciones`}
      />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl">
        <NuevaLiquidacionView
          revendedora={revendedora}
          desde={desde}
          hasta={hasta}
          preview={preview}
        />
      </main>
    </>
  )
}

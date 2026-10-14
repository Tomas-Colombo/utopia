import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import {
  obtenerRevendedora,
  obtenerLiquidacionConDetalle,
} from '@/lib/dal/revendedoras'
import { listCuentasDestino } from '@/lib/dal/ventas/cuenta-destino'
import { LiquidacionDetalleView } from './LiquidacionDetalleView'

export default async function LiquidacionDetallePage(props: {
  params: Promise<{ id: string; idLiquidacion: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id, idLiquidacion } = await props.params

  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  const liqRes = await obtenerLiquidacionConDetalle(idLiquidacion)
  if (!liqRes.ok) notFound()

  const puedeLiquidar = hasPermission(session, 'revendedoras', 'liquidar')
  const cuentas = await listCuentasDestino({ soloActivas: true })

  return (
    <>
      <Topbar
        title={`Liquidación · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}/liquidaciones`}
      />
      <main className="flex-1 p-6 max-w-5xl">
        <LiquidacionDetalleView
          data={liqRes.data}
          puedeLiquidar={puedeLiquidar}
          cuentas={cuentas}
        />
      </main>
    </>
  )
}

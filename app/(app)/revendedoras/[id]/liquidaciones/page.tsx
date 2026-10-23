import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora, listarLiquidacionesRevendedora } from '@/lib/dal/revendedoras'
import { RevendedoraTabs } from '../RevendedoraTabs'
import { LiquidacionesRevendedoraTable } from './LiquidacionesRevendedoraTable'
import { Card } from '@/components/ui/Card'

export default async function RevendedoraLiquidacionesPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id } = await props.params
  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  const liqRes = await listarLiquidacionesRevendedora(id)
  const liquidaciones = liqRes.ok ? liqRes.data : []
  const puedeLiquidar = hasPermission(session, 'revendedoras', 'liquidar')

  return (
    <>
      <Topbar
        title={`Liquidaciones · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}`}
        actions={
          puedeLiquidar && (
            <Link href={`/revendedoras/${id}/liquidaciones/nueva`}>
              <Button size="sm">Nueva liquidación</Button>
            </Link>
          )
        }
      />
      <main className="flex-1 p-4 sm:p-6 space-y-6">
        <RevendedoraTabs idRevendedora={id} activeTab="liquidaciones" />

        <Card padding="none" className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Historial de liquidaciones</h2>
            <span className="text-sm text-muted">
              {liquidaciones.length} liquidaci{liquidaciones.length === 1 ? 'ón' : 'ones'}
            </span>
          </div>

          <LiquidacionesRevendedoraTable
            idRevendedora={id}
            liquidaciones={liquidaciones}
          />
        </Card>
      </main>
    </>
  )
}

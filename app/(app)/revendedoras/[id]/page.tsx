import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora, getComisionRevendedora } from '@/lib/dal/revendedoras'
import { hasPermission } from '@/lib/dal/guard'
import { EditarRevendedoraForm } from './EditarRevendedoraForm'
import { ComisionPropiaCard } from './ComisionPropiaCard'
import { RevendedoraTabs } from './RevendedoraTabs'
import { Card } from '@/components/ui/Card'

export default async function RevendedoraPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  const { id } = await params
  const revendedora = await obtenerRevendedora(session, id)
  
  if (!revendedora) notFound()

  const canEdit = hasPermission(session, 'revendedoras', 'editar')
  const { resolucion, reglaPropia, reglaGeneral } = await getComisionRevendedora(revendedora.id_revendedora)

  return (
    <>
      <Topbar
        title={`${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref="/revendedoras"
      />
      <main className="flex-1 p-6 space-y-6 max-w-4xl">
        <RevendedoraTabs idRevendedora={revendedora.id_revendedora} activeTab="resumen" />
        <Card padding="none" className="p-6">
          <EditarRevendedoraForm revendedora={revendedora} />
        </Card>
        <ComisionPropiaCard
          idRevendedora={revendedora.id_revendedora}
          resolucion={resolucion}
          reglaPropia={reglaPropia}
          reglaGeneral={reglaGeneral}
          canEdit={canEdit}
        />
      </main>
    </>
  )
}

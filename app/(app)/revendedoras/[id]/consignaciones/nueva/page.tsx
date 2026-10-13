import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora } from '@/lib/dal/revendedoras'
import { NuevaConsignacionRevendedoraForm } from './NuevaConsignacionRevendedoraForm'

export default async function NuevaConsignacionRevendedoraPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'crear')

  const { id } = await props.params
  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  return (
    <>
      <Topbar
        title={`Nueva consignación · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}/consignaciones`}
      />
      <main className="flex-1 p-6">
        <div className="max-w-4xl rounded-lg border border-border bg-card p-6">
          <NuevaConsignacionRevendedoraForm
            idRevendedora={id}
            nombreRevendedora={`${revendedora.nombre} ${revendedora.apellido}`}
          />
        </div>
      </main>
    </>
  )
}

import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora } from '@/lib/dal/revendedoras'
import { EditarRevendedoraForm } from './EditarRevendedoraForm'

export default async function RevendedoraPage({ params }: { params: { id: string } }) {
  const session = await verifySession()
  const revendedora = await obtenerRevendedora(session, params.id)
  
  if (!revendedora) notFound()

  return (
    <>
      <Topbar title={`${revendedora.nombre} ${revendedora.apellido}`} session={session} backHref="/revendedoras" />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <EditarRevendedoraForm revendedora={revendedora} />
        </div>
      </main>
    </>
  )
}

import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listarRevendedoras } from '@/lib/dal/revendedoras'
import { hasPermission } from '@/lib/dal/guard'
import { RevendedorasView } from './RevendedorasView'

export const metadata = {
  title: 'Revendedoras | Utopía',
}

export default async function RevendedorasPage() {
  const session = await verifySession()
  const revendedoras = await listarRevendedoras(session)
  const canCreate = hasPermission(session, 'revendedoras', 'crear')

  return (
    <>
      <Topbar title="Revendedoras" session={session} />
      <main className="flex-1 p-6">
        <RevendedorasView data={revendedoras} canCreate={canCreate} />
      </main>
    </>
  )
}

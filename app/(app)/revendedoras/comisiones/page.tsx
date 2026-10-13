import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { requireModuleRole, hasPermission } from '@/lib/dal/guard'
import { listReglasComision } from '@/lib/dal/revendedoras/comisiones'
import { ReglasComisionView } from './ReglasComisionView'

export const metadata = {
  title: 'Comisiones | Utopía',
}

export default async function ComisionesPage() {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const canEdit = hasPermission(session, 'revendedoras', 'editar')
  const reglas = await listReglasComision()

  return (
    <>
      <Topbar
        title="Reglas de comisión"
        session={session}
        backHref="/revendedoras"
      />
      <main className="flex-1 p-6">
        <ReglasComisionView reglas={reglas} canEdit={canEdit} />
      </main>
    </>
  )
}

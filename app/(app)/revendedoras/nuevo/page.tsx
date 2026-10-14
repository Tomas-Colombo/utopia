import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { NuevaRevendedoraForm } from './NuevaRevendedoraForm'

export const metadata = {
  title: 'Nueva revendedora | Utopía',
}

export default async function NuevaRevendedoraPage() {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'crear')

  const canGrantAccess =
    hasPermission(session, 'administracion', 'crear') &&
    hasPermission(session, 'revendedoras', 'editar')
  const canEditComision = hasPermission(session, 'revendedoras', 'editar')

  return (
    <>
      <Topbar title="Nueva revendedora" session={session} backHref="/revendedoras" />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <NuevaRevendedoraForm
            canGrantAccess={canGrantAccess}
            canEditComision={canEditComision}
          />
        </div>
      </main>
    </>
  )
}

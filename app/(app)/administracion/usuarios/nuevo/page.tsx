import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listRoles } from '@/lib/dal/administracion/administracion'
import { InvitarUsuarioForm } from './InvitarUsuarioForm'

export default async function NuevoUsuarioPage() {
  const session = await verifySession()
  const roles = await listRoles()
  return (
    <>
      <Topbar title="Invitar usuario" session={session} backHref="/administracion/usuarios" />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <InvitarUsuarioForm
            roles={roles.map((r) => ({ id: r.id_rol, nombre: r.nombre }))}
          />
        </div>
      </main>
    </>
  )
}

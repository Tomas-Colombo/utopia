import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listRoles } from '@/lib/dal/administracion/administracion'
import { listarRevendedoras } from '@/lib/dal/revendedoras'
import type { RevendedoraRow } from '@/lib/types/revendedoras'
import { InvitarUsuarioForm } from './InvitarUsuarioForm'

export default async function NuevoUsuarioPage() {
  const session = await verifySession()
  const roles = await listRoles()
  let revs: RevendedoraRow[] = []
  if (session.modulosHabilitados.includes('revendedoras')) {
    const allRevs = await listarRevendedoras(session)
    revs = allRevs.filter(r => r.activo && !r.id_usuario)
  }

  return (
    <>
      <Topbar title="Invitar usuario" session={session} backHref="/administracion/usuarios" />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <InvitarUsuarioForm
            roles={roles.map((r) => ({ id: r.id_rol, nombre: r.nombre }))}
            revendedorasLibres={revs}
          />
        </div>
      </main>
    </>
  )
}

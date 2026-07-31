import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listRoles, listUsuarios } from '@/lib/dal/administracion/administracion'
import { UsuariosView } from './UsuariosView'

export default async function UsuariosAdminPage() {
  const session = await verifySession()
  const [usuarios, roles] = await Promise.all([listUsuarios(), listRoles()])
  return (
    <>
      <Topbar
        title="Usuarios"
        session={session}
        backHref="/administracion"
        actions={
          <Link href="/administracion/usuarios/nuevo">
            <Button size="sm">Invitar usuario</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <UsuariosView
          initial={usuarios}
          roles={roles.map((r) => ({ id: r.id_rol, nombre: r.nombre }))}
        />
      </main>
    </>
  )
}

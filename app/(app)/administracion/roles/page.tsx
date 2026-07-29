import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listRoles } from '@/lib/dal/administracion/administracion'
import { RolesView } from './RolesView'

export default async function RolesPage() {
  const session = await verifySession()
  const roles = await listRoles()
  return (
    <>
      <Topbar
        title="Roles y permisos"
        session={session}
        actions={
          <Link href="/administracion/roles/nuevo">
            <Button size="sm">Nuevo rol</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <RolesView initial={roles} />
      </main>
    </>
  )
}

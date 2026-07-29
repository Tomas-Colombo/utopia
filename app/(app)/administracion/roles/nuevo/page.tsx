import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { NuevoRolForm } from './NuevoRolForm'

export default async function NuevoRolPage() {
  const session = await verifySession()
  return (
    <>
      <Topbar title="Nuevo rol" session={session} />
      <main className="flex-1 p-6">
        <div className="max-w-3xl">
          <NuevoRolForm />
        </div>
      </main>
    </>
  )
}

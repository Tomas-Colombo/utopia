import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listControlDePrecios } from '@/lib/dal/precios/resolucion'
import { ControlDePreciosView } from './ControlDePreciosView'

export default async function ControlDePreciosPage() {
  const session = await verifySession()
  const rows = await listControlDePrecios()
  return (
    <>
      <Topbar title="Control de precios" session={session} />
      <main className="flex-1 p-6">
        <ControlDePreciosView initial={rows} />
      </main>
    </>
  )
}

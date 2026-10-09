import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { NuevaRevendedoraForm } from './NuevaRevendedoraForm'

export default async function NuevaRevendedoraPage() {
  const session = await verifySession()
  return (
    <>
      <Topbar title="Nueva revendedora" session={session} backHref="/revendedoras" />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <NuevaRevendedoraForm />
        </div>
      </main>
    </>
  )
}

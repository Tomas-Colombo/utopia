import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { NuevoClienteForm } from './NuevoClienteForm'

export default async function NuevoClientePage() {
  const session = await verifySession()
  return (
    <>
      <Topbar title="Nuevo cliente" session={session} backHref="/clientes" />
      <main className="flex-1 p-6">
        <div className="max-w-xl rounded-lg border border-border bg-card p-6">
          <NuevoClienteForm />
        </div>
      </main>
    </>
  )
}

import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { NuevoClienteForm } from './NuevoClienteForm'
import { Card } from '@/components/ui/Card'

export default async function NuevoClientePage() {
  const session = await verifySession()
  return (
    <>
      <Topbar title="Nuevo cliente" session={session} backHref="/clientes" />
      <main className="flex-1 p-6">
        <Card padding="none" className="max-w-xl p-6">
          <NuevoClienteForm />
        </Card>
      </main>
    </>
  )
}

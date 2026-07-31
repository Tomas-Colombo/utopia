import { Topbar } from '@/components/shell/Topbar'
import { CameraScanStub } from '@/components/inventario/CameraScanStub'
import { verifySession } from '@/lib/dal/session'

export default async function FichaEntradaPage() {
  const session = await verifySession()
  return (
    <>
      <Topbar title="Escanear ítem" session={session} backHref="/inventario" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-md">
          <CameraScanStub />
        </div>
      </main>
    </>
  )
}

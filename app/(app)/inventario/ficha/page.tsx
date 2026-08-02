import { Topbar } from '@/components/shell/Topbar'
import { CameraScanStub } from '@/components/inventario/CameraScanStub'
import { verifySession } from '@/lib/dal/session'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'

export default async function FichaEntradaPage() {
  const session = await verifySession()
  const productos = await listProductosConDetalle({ soloActivos: true })
  return (
    <>
      <Topbar title="Escanear ítem" session={session} backHref="/inventario" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-md">
          <CameraScanStub productos={productos} />
        </div>
      </main>
    </>
  )
}

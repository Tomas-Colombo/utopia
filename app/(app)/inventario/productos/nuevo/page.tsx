import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { NuevoProductoForm } from './NuevoProductoForm'

export default async function NuevoProductoPage() {
  const session = await verifySession()
  const categorias = await listCategoriasActivas()
  if (categorias.length === 0) {
    // Sin categorías no se puede crear producto; mandamos a categorías.
    redirect('/inventario/categorias?e=needs-categoria')
  }
  return (
    <>
      <Topbar title="Nuevo producto" session={session} />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <NuevoProductoForm categorias={categorias} />
        </div>
      </main>
    </>
  )
}

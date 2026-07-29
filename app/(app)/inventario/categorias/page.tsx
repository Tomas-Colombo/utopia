import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategorias } from '@/lib/dal/inventario/categoria'
import { CategoriasView } from './CategoriasView'

export default async function CategoriasPage() {
  const session = await verifySession()
  const categorias = await listCategorias()
  return (
    <>
      <Topbar title="Categorías" session={session} />
      <main className="flex-1 p-6">
        <CategoriasView initial={categorias} />
      </main>
    </>
  )
}

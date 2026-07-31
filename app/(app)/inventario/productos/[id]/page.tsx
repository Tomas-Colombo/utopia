import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { getProducto } from '@/lib/dal/inventario/producto'
import { EditarProductoForm } from './EditarProductoForm'

export default async function EditarProductoPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const [producto, categorias] = await Promise.all([
    getProducto(id),
    listCategoriasActivas(),
  ])
  if (!producto) notFound()

  return (
    <>
      <Topbar
        title={`Editar producto: ${producto.nombre}`}
        session={session}
        backHref="/inventario"
      />
      <main className="flex-1 p-6">
        <div className="max-w-2xl rounded-lg border border-border bg-card p-6">
          <EditarProductoForm producto={producto} categorias={categorias} />
        </div>
      </main>
    </>
  )
}

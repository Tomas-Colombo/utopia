import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { ProductosTableClient } from './ProductosTableClient'

export default async function ProductosPage(props: {
  searchParams: Promise<{ q?: string; cat?: string }>
}) {
  const session = await verifySession()
  const searchParams = await props.searchParams
  const [productos, categorias] = await Promise.all([
    listProductosConDetalle({
      search: searchParams.q,
      idCategoria: searchParams.cat,
    }),
    listCategoriasActivas(),
  ])

  return (
    <>
      <Topbar
        title="Productos"
        session={session}
        actions={
          <Link href="/inventario/productos/nuevo">
            <Button size="sm">Nuevo producto</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        <ProductosTableClient
          rows={productos}
          categorias={categorias}
          initialSearch={searchParams.q ?? ''}
          initialCategoria={searchParams.cat ?? ''}
        />
      </main>
    </>
  )
}

import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { verifySession } from '@/lib/dal/session'
import { getIngreso } from '@/lib/dal/inventario/ingreso'
import { listCategoriasActivas } from '@/lib/dal/inventario/categoria'
import { listProductosConDetalle } from '@/lib/dal/inventario/producto'
import { IngresoDetalleView } from './IngresoDetalleView'

/** Whitelist para el ?from — evita open-redirect: solo rutas internas del app. */
function safeBackHref(from: string | undefined, fallback: string): string {
  if (!from) return fallback
  if (!from.startsWith('/') || from.startsWith('//')) return fallback
  return from
}

export default async function IngresoDetallePage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const { from } = await props.searchParams
  const ingreso = await getIngreso(id)
  if (!ingreso) notFound()

  const [productos, categorias] = await Promise.all([
    listProductosConDetalle({ soloActivos: true }),
    listCategoriasActivas(),
  ])

  return (
    <>
      <Topbar
        title={`Ingreso ${new Date(ingreso.fecha).toLocaleDateString('es-AR')}`}
        session={session}
        backHref={safeBackHref(from, '/inventario/ingresos')}
        actions={
          <Badge variant={ingreso.confirmado ? 'success' : 'neutral'}>
            {ingreso.confirmado ? 'Confirmado' : 'Borrador'}
          </Badge>
        }
      />
      <main className="flex-1 p-6">
        <IngresoDetalleView ingreso={ingreso} productos={productos} categorias={categorias} />
      </main>
    </>
  )
}

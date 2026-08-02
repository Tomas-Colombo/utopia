import Link from 'next/link'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { verifySession } from '@/lib/dal/session'
import { listProveedores } from '@/lib/dal/inventario/proveedor'
import { waMeLink } from '@/lib/utils/waMeLink'
import { ProveedoresTableClient } from './ProveedoresTableClient'

export default async function ProveedoresPage() {
  const session = await verifySession()
  const rows = await listProveedores()
  const enriched = rows.map((r) => ({ ...r, wa: waMeLink(r.telefono) }))

  return (
    <>
      <Topbar
        title="Proveedores"
        session={session}
        actions={
          <Link href="/proveedores/nuevo">
            <Button size="sm">Nuevo proveedor</Button>
          </Link>
        }
      />
      <main className="flex-1 p-6">
        {rows.length === 0 ? (
          <EmptyStateWrapper />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <ProveedoresTableClient rows={enriched} />
          </div>
        )}
      </main>
    </>
  )
}

function EmptyStateWrapper() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <p className="font-display text-lg mb-2">Sin proveedores todavía</p>
      <p className="text-sm text-muted mb-4">
        Agregá el primer proveedor para poder registrar ingresos.
      </p>
      <Link
        href="/proveedores/nuevo"
        className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
      >
        Nuevo proveedor
      </Link>
    </div>
  )
}

export function _renderBadge(activo: boolean) {
  return <Badge variant={activo ? 'success' : 'neutral'}>{activo ? 'Activo' : 'Inactivo'}</Badge>
}

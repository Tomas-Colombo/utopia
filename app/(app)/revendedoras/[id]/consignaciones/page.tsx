import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora, listConsignacionesRevendedora } from '@/lib/dal/revendedoras'
import type { ConsignacionRevendedoraListItem } from '@/lib/types/revendedoras'

export default async function ConsignacionesRevendedoraPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id } = await props.params
  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  const consignaciones = await listConsignacionesRevendedora(id)
  const puedeCrear = hasPermission(session, 'revendedoras', 'crear')

  const columns: Column<ConsignacionRevendedoraListItem>[] = [
    {
      key: 'estado',
      label: 'Estado',
      render: (r) => {
        if (!r.confirmada) {
          return <Badge variant="warning">Borrador</Badge>
        }
        if (r.estado === 'abierta') {
          return <Badge variant="success">Abierta</Badge>
        }
        return <Badge variant="neutral">Cerrada</Badge>
      },
    },
    {
      key: 'periodo',
      label: 'Período',
      render: (r) => {
        if (!r.periodo_desde && !r.periodo_hasta) return <span className="text-muted">—</span>
        return (
          <span className="font-mono text-xs">
            {r.periodo_desde || '…'} al {r.periodo_hasta || '…'}
          </span>
        )
      },
    },
    {
      key: 'items',
      label: 'Ítems (Total / En poder)',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-sm">
          {r.total_items} / {r.items_en_poder}
        </span>
      ),
    },
    {
      key: 'observaciones',
      label: 'Observaciones',
      render: (r) =>
        r.observaciones ? (
          <span className="truncate max-w-xs block text-sm">{r.observaciones}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'created_at',
      label: 'Fecha alta',
      render: (r) => (
        <span className="font-mono text-xs">
          {new Date(r.created_at).toLocaleDateString('es-AR')}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (r) => (
        <Link
          href={`/revendedoras/${id}/consignaciones/${r.id_consignacion_revendedora}`}
          className="text-pink-strong hover:underline text-sm font-medium"
        >
          Ver detalle
        </Link>
      ),
    },
  ]

  return (
    <>
      <Topbar
        title={`Consignaciones · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}`}
        actions={
          puedeCrear && (
            <Link href={`/revendedoras/${id}/consignaciones/nueva`}>
              <Button size="sm">Nueva consignación</Button>
            </Link>
          )
        }
      />
      <main className="flex-1 p-6 space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Historial de consignaciones</h2>
            <span className="text-sm text-muted">
              {consignaciones.length} lote{consignaciones.length === 1 ? '' : 's'}
            </span>
          </div>

          {consignaciones.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="font-display text-lg text-text">Sin consignaciones</p>
              <p className="text-sm text-muted">
                Esta revendedora aún no tiene lotes de mercadería consignados.
              </p>
              {puedeCrear && (
                <Link
                  href={`/revendedoras/${id}/consignaciones/nueva`}
                  className="rounded-md bg-accent-pink px-4 py-2 font-body text-sm font-semibold text-sidebar"
                >
                  Nueva consignación
                </Link>
              )}
            </div>
          ) : (
            <Table
              data={consignaciones}
              columns={columns}
              getRowId={(r) => r.id_consignacion_revendedora}
            />
          )}
        </div>
      </main>
    </>
  )
}

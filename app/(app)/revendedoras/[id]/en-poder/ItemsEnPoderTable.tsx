'use client'

import { Table, type Column } from '@/components/ui/Table'
import type { ItemEnPoderRevendedoraRow } from '@/lib/dal/revendedoras/panel'
import { Card } from '@/components/ui/Card'

export function ItemsEnPoderTable({ items }: { items: ItemEnPoderRevendedoraRow[] }) {
  const columns: Column<ItemEnPoderRevendedoraRow>[] = [
    {
      key: 'nombre_producto',
      label: 'Producto',
      render: (r) => (
        <div>
          <div className="font-medium text-text">{r.nombre_producto}</div>
          {r.sku && <div className="text-xs font-mono text-muted">SKU: {r.sku}</div>}
        </div>
      ),
    },
    {
      key: 'precio_venta',
      label: 'Precio de venta',
      render: (r) => (
        <span className="font-mono">
          $ {Number(r.precio_venta).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      ),
    },
    {
      key: 'fecha_entrega',
      label: 'Entregado el',
      render: (r) => (
        <span className="text-sm text-muted">
          {r.fecha_entrega ? new Date(r.fecha_entrega).toLocaleDateString('es-AR') : '—'}
        </span>
      ),
    },
  ]

  return (
    <Card padding="none" className="overflow-hidden">
      <Table columns={columns} data={items} getRowId={(r) => r.id_item} />
    </Card>
  )
}

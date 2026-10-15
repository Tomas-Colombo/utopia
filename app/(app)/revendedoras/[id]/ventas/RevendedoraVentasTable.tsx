'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import type { VentaListada } from '@/lib/dal/ventas/venta'
import { formatearMoneda } from '@/lib/utils/moneda'

interface RevendedoraVentasTableProps {
  rows: VentaListada[]
}

export function RevendedoraVentasTable({ rows }: RevendedoraVentasTableProps) {
  const columns: Column<VentaListada>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v) => (
        <Link href={`/ventas/${v.id_venta}`} className="font-mono text-ink hover:underline">
          {new Date(v.fecha).toLocaleDateString('es-AR')}
        </Link>
      ),
    },
    {
      key: 'cliente',
      label: 'Cliente',
      render: (v) => v.cliente?.nombre_completo || v.cliente?.nombre || 'Consumidor final',
    },
    {
      key: 'lineas_count',
      label: 'Líneas',
      render: (v) => <span className="font-mono text-xs">{v.lineas_count}</span>,
    },
    {
      key: 'total',
      label: 'Total',
      render: (v) => <span className="font-mono font-medium">{formatearMoneda(Number(v.total))}</span>,
    },
    {
      key: 'estado_venta',
      label: 'Estado',
      render: (v) => (
        <Badge variant={v.estado_venta === 'registrada' ? 'success' : 'neutral'}>
          {v.estado_venta === 'registrada' ? 'Registrada' : 'Anulada'}
        </Badge>
      ),
    },
  ]

  return (
    <Table
      data={rows}
      columns={columns}
      getRowId={(v) => v.id_venta}
      emptyState={
        <div className="py-8 text-center text-sm text-muted">
          No hay ventas registradas por esta revendedora.
        </div>
      }
    />
  )
}

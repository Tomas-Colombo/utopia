'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import type { ProveedorRow } from '@/lib/types/inventario'

type Row = ProveedorRow & { wa: string | null }

export function ProveedoresTableClient({ rows }: { rows: Row[] }) {
  const columns: Column<Row>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (r) => (
        <span className="font-mono text-xs uppercase">{r.tipo}</span>
      ),
    },
    {
      key: 'telefono',
      label: 'Teléfono',
      render: (r) =>
        r.wa ? (
          <a
            href={r.wa}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-strong hover:underline"
          >
            {r.telefono} · WhatsApp
          </a>
        ) : (
          <span className="text-muted-2">—</span>
        ),
    },
    {
      key: 'dias_rotacion',
      label: 'Rotación',
      align: 'right',
      render: (r) =>
        r.dias_rotacion != null ? `${r.dias_rotacion} días` : <span className="text-muted-2">—</span>,
    },
    {
      key: 'activo',
      label: 'Estado',
      render: (r) => (
        <Badge variant={r.activo ? 'success' : 'neutral'}>
          {r.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (r) => (
        <Link
          href={`/inventario/proveedores/${r.id_proveedor}`}
          className="text-sm text-pink-strong hover:underline"
        >
          Ver
        </Link>
      ),
    },
  ]

  return <Table columns={columns} data={rows} getRowId={(r) => r.id_proveedor} />
}

'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Table, type Column } from '@/components/ui/Table'
import type { LiquidacionRevendedoraRow } from '@/lib/types/revendedoras'
import { formatearMoneda } from '@/lib/utils/moneda'

interface LiquidacionesRevendedoraTableProps {
  idRevendedora: string
  liquidaciones: LiquidacionRevendedoraRow[]
}

export function LiquidacionesRevendedoraTable({
  idRevendedora,
  liquidaciones,
}: LiquidacionesRevendedoraTableProps) {
  const columns: Column<LiquidacionRevendedoraRow>[] = [
    {
      key: 'periodo',
      label: 'Período',
      render: (l) => (
        <Link
          href={`/revendedoras/${idRevendedora}/liquidaciones/${l.id_liquidacion}`}
          className="font-mono text-xs hover:underline text-rosa"
        >
          {new Date(l.periodo_desde).toLocaleDateString('es-AR')} →{' '}
          {new Date(l.periodo_hasta).toLocaleDateString('es-AR')}
        </Link>
      ),
    },
    {
      key: 'monto_vendido',
      label: 'Vendido',
      render: (l) => <span className="font-mono">{formatearMoneda(Number(l.monto_vendido))}</span>,
    },
    {
      key: 'porcentaje_aplicado',
      label: 'Comisión %',
      render: (l) => <span className="font-mono text-xs">{Number(l.porcentaje_aplicado)} %</span>,
    },
    {
      key: 'monto_comision',
      label: 'Monto Comisión',
      render: (l) => <span className="font-mono">{formatearMoneda(Number(l.monto_comision))}</span>,
    },
    {
      key: 'monto_a_cobrar',
      label: 'Total a Cobrar',
      render: (l) => (
        <span className="font-mono font-semibold text-foreground">
          {formatearMoneda(Number(l.monto_a_cobrar))}
        </span>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (l) => (
        <Badge variant={l.estado === 'pagada' ? 'success' : 'warning'}>
          {l.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
        </Badge>
      ),
    },
    {
      key: 'fecha_pago',
      label: 'Fecha pago',
      render: (l) =>
        l.fecha_pago ? (
          <span className="font-mono text-xs text-muted">
            {new Date(l.fecha_pago).toLocaleDateString('es-AR')}
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
  ]

  return (
    <Table
      data={liquidaciones}
      columns={columns}
      getRowId={(l) => l.id_liquidacion}
      emptyState={
        <div className="py-8 text-center text-sm text-muted">
          No hay liquidaciones registradas para esta revendedora.
        </div>
      }
    />
  )
}

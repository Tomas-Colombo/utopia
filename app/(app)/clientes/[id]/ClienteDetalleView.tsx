'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, type Column } from '@/components/ui/Table'
import { formaPagoLabel } from '@/lib/types/precios'
import {
  ESTADO_RESERVA_LABEL,
  type ClienteRow,
  type EstadoReserva,
  type ReservaRow,
  type VentaRow,
} from '@/lib/types/ventas'
import { EditarClienteModal } from '../EditarClienteModal'

const RESERVA_VARIANT: Record<
  EstadoReserva,
  'success' | 'info' | 'warning' | 'danger' | 'neutral'
> = {
  activa: 'success',
  cancelada: 'neutral',
  vencida: 'warning',
  convertida_venta: 'info',
}

/**
 * Parte interactiva de la ficha: el botón de editar y las tablas de historial.
 *
 * Las tablas usan el mismo `Table` que el resto de la app en vez de markup
 * propio — eran las últimas que quedaban a mano, y su `<th>`/`<td>` sueltos no
 * traían los roles ARIA ni el estado vacío que el componente ya resuelve.
 */
export function ClienteDetalleView({
  cliente,
  ventas,
  reservas,
}: {
  cliente: ClienteRow
  ventas: VentaRow[]
  reservas: ReservaRow[]
}) {
  const [editando, setEditando] = useState(false)

  const columnasVentas: Column<VentaRow>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v) => (
        <Link href={`/ventas/${v.id_venta}`} className="hover:underline">
          {new Date(v.fecha).toLocaleDateString('es-AR')}
        </Link>
      ),
    },
    {
      key: 'forma_pago',
      label: 'Forma de pago',
      render: (v) => formaPagoLabel(v.forma_pago),
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (v) => <span className="font-mono">{money(Number(v.total))}</span>,
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (v) =>
        v.estado_venta === 'anulada' ? (
          <Badge variant="danger">Anulada</Badge>
        ) : (
          <Badge variant="success">Registrada</Badge>
        ),
    },
  ]

  const columnasReservas: Column<ReservaRow>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (r) => (
        <Link href={`/ventas/reservas/${r.id_reserva}`} className="hover:underline">
          {new Date(r.fecha).toLocaleDateString('es-AR')}
        </Link>
      ),
    },
    {
      key: 'vence',
      label: 'Vence',
      render: (r) => new Date(r.fecha_vencimiento).toLocaleDateString('es-AR'),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (r) => (
        <Badge variant={RESERVA_VARIANT[r.estado_reserva]}>
          {ESTADO_RESERVA_LABEL[r.estado_reserva]}
        </Badge>
      ),
    },
  ]

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="font-mono text-xs uppercase text-muted">Teléfono</div>
            <div className="mt-1">{cliente.telefono ?? '—'}</div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase text-muted">Email</div>
            <div className="mt-1">{cliente.email ?? '—'}</div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase text-muted">Notas</div>
            <div className="mt-1">{cliente.notas ?? '—'}</div>
          </div>
          <div className="flex items-start justify-end">
            <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
              Editar cliente
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg">Historial de compras</h2>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table
            columns={columnasVentas}
            data={ventas}
            getRowId={(v) => v.id_venta}
            emptyState="Sin compras registradas."
          />
        </div>
      </section>

      {reservas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg">Reservas</h2>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table
              columns={columnasReservas}
              data={reservas}
              getRowId={(r) => r.id_reserva}
              emptyState="Sin reservas."
            />
          </div>
        </section>
      )}

      <EditarClienteModal
        cliente={cliente}
        open={editando}
        onClose={() => setEditando(false)}
      />
    </>
  )
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

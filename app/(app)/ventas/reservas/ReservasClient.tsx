'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  ESTADO_RESERVA_LABEL,
  type EstadoReserva,
  type ReservaRow,
} from '@/lib/types/ventas'
import { vencerReservasAction } from '../actions'

type Row = ReservaRow & {
  cliente: { id_cliente: string; nombre: string } | null
  items_count: number
}

const VARIANT: Record<EstadoReserva, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  activa: 'success',
  cancelada: 'neutral',
  vencida: 'warning',
  convertida_venta: 'info',
}

export function ReservasClient({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  function vencer() {
    start(async () => {
      const res = await vencerReservasAction()
      if (!res.ok) return toast.error('No se pudo procesar', res.reason)
      toast.success(
        res.data?.vencidas
          ? `${res.data.vencidas} reserva(s) marcadas como vencidas`
          : 'No había reservas para vencer',
      )
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={vencer} disabled={pending}>
          Purgar vencidas
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg mb-2">Sin reservas</p>
          <p className="text-sm text-muted mb-4">
            Creá una reserva para bloquear ítems por un plazo determinado.
          </p>
          <Link
            href="/ventas/reservas/nueva"
            className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
          >
            Nueva reserva
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-right">Ítems</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id_reserva} className="border-b border-border-2">
                  <td className="px-4 py-3">{r.cliente?.nombre ?? 'Mostrador'}</td>
                  <td className="px-4 py-3">{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-3">
                    {new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.items_count}</td>
                  <td className="px-4 py-3">
                    <Badge variant={VARIANT[r.estado_reserva]}>
                      {ESTADO_RESERVA_LABEL[r.estado_reserva]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/ventas/reservas/${r.id_reserva}`}
                      className="text-sm text-pink-strong hover:underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

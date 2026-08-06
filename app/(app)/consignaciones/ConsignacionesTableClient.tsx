'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  ESTADO_CONSIGNACION_LABEL,
  type ConsignacionConResumen,
  type EstadoConsignacion,
} from '@/lib/types/consignaciones'
import {
  cerrarConsignacionAction,
  confirmarConsignacionAction,
  eliminarConsignacionAction,
} from './actions'

const VARIANT: Record<EstadoConsignacion, 'success' | 'neutral'> = {
  activa: 'success',
  cerrada: 'neutral',
}

/**
 * Tabla del listado de devoluciones con las acciones del lote en la fila.
 *
 * Las mismas operaciones del detalle (confirmar, cerrar, eliminar) viven acá
 * para no obligar a entrar al lote por cada una. Comparten las Server Actions
 * del módulo, así que la validación y la auditoría son idénticas: esto es otro
 * punto de entrada, no otra implementación. Editar observaciones NO está acá:
 * se hace desde el detalle, que es donde se revisa el lote antes de confirmar.
 *
 * `Abrir` lleva el `?from=` con la URL filtrada actual, para que el botón
 * volver del Topbar devuelva al listado con los filtros puestos.
 */
export function ConsignacionesTableClient({
  rows,
  puedeEliminar,
  volverHref,
}: {
  rows: ConsignacionConResumen[]
  puedeEliminar: boolean
  volverHref: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [confirmar, setConfirmar] = useState<ConsignacionConResumen | null>(null)
  const [cerrar, setCerrar] = useState<ConsignacionConResumen | null>(null)
  const [eliminar, setEliminar] = useState<ConsignacionConResumen | null>(null)

  const from = encodeURIComponent(volverHref)

  function ejecutarConfirmar() {
    const row = confirmar
    setConfirmar(null)
    if (!row) return
    start(async () => {
      const res = await confirmarConsignacionAction({ idConsignacion: row.id_consignacion })
      if (!res.ok) return toast.error('No se pudo confirmar', traducir(res.reason))
      toast.success(`Lote confirmado · ${res.data!.confirmados} ítem(s) devueltos`)
      router.refresh()
    })
  }

  function ejecutarCerrar() {
    const row = cerrar
    setCerrar(null)
    if (!row) return
    start(async () => {
      const res = await cerrarConsignacionAction({ idConsignacion: row.id_consignacion })
      if (!res.ok) return toast.error('No se pudo cerrar', traducir(res.reason))
      toast.success('Consignación cerrada')
      router.refresh()
    })
  }

  function ejecutarEliminar() {
    const row = eliminar
    setEliminar(null)
    if (!row) return
    start(async () => {
      const res = await eliminarConsignacionAction({ idConsignacion: row.id_consignacion })
      if (!res.ok) return toast.error('No se pudo eliminar', traducir(res.reason))
      const n = res.data!.reestockeados
      toast.success(
        'Consignación eliminada',
        n > 0 ? `${n} ítem(s) volvieron al stock disponible` : undefined,
      )
      router.refresh()
    })
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3 text-right">Pendientes</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const activa = r.estado === 'activa'
              return (
                <tr key={r.id_consignacion} className="border-b border-border-2">
                  <td className="px-4 py-3">{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-3">{r.proveedor?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {r.pendientes > 0 ? (
                      <span className="text-terracota">{r.pendientes}</span>
                    ) : (
                      r.pendientes
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={VARIANT[r.estado]}>{ESTADO_CONSIGNACION_LABEL[r.estado]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Link href={`/consignaciones/${r.id_consignacion}?from=${from}`}>
                        <Button size="sm" variant="secondary" disabled={pending}>
                          Abrir
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmar(r)}
                        disabled={pending || !activa || r.pendientes === 0}
                        title={
                          !activa
                            ? 'El lote ya está cerrado'
                            : r.pendientes === 0
                              ? 'No quedan ítems pendientes'
                              : 'Confirmar la salida de todos los pendientes y cerrar'
                        }
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCerrar(r)}
                        disabled={pending || !activa || r.pendientes > 0}
                        title={
                          !activa
                            ? 'El lote ya está cerrado'
                            : r.pendientes > 0
                              ? 'Resolvé todos los pendientes primero'
                              : 'Cerrar el lote'
                        }
                      >
                        Cerrar lote
                      </Button>
                      {puedeEliminar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEliminar(r)}
                          disabled={pending}
                          title="Borra el lote; los ítems que ya salieron vuelven al stock"
                        >
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmar}
        title="Confirmar el lote completo"
        description={`Se confirma la salida de los ${confirmar?.pendientes ?? 0} ítem(s) pendientes y el lote queda cerrado. Los ítems dejan de estar en stock.`}
        confirmLabel="Sí, salió todo"
        cancelLabel="Cancelar"
        onConfirm={ejecutarConfirmar}
        onCancel={() => setConfirmar(null)}
      />

      <ConfirmDialog
        open={!!cerrar}
        title="Cerrar consignación"
        description="No se van a poder apartar más ítems en este lote. Solo se puede cerrar si no quedan ítems pendientes."
        confirmLabel="Sí, cerrar"
        cancelLabel="Cancelar"
        onConfirm={ejecutarCerrar}
        onCancel={() => setCerrar(null)}
      />

      <ConfirmDialog
        open={!!eliminar}
        title="Eliminar la consignación"
        description={
          (eliminar?.devueltos ?? 0) > 0
            ? `El lote se borra definitivamente y los ${eliminar?.devueltos} ítem(s) que ya habían salido VUELVEN al stock disponible. Usalo solo si la devolución se cargó por error.`
            : 'El lote se borra definitivamente. Los ítems apartados quedan libres para venta o para otro lote.'
        }
        variant="danger"
        confirmLabel="Sí, eliminar"
        cancelLabel="Volver"
        onConfirm={ejecutarEliminar}
        onCancel={() => setEliminar(null)}
      />
    </>
  )
}

function traducir(reason: string): string {
  if (reason.startsWith('quedan-pendientes'))
    return 'Quedan ítems pendientes de devolver o cancelar.'
  if (reason === 'consignacion-no-activa') return 'La consignación ya está cerrada.'
  if (reason === 'consignacion-not-found') return 'La consignación ya no existe.'
  if (reason === 'no-permission') return 'Tu rol no tiene permiso para esta acción.'
  return reason
}

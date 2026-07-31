'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import type { IngresoConResumen } from '@/lib/types/inventario'
import { cancelarIngresoAction } from '../actions'

/** Traduce los errores del RPC a mensajes de negocio. */
function explicar(reason: string): string {
  if (reason.includes('items-movidos')) {
    const n = reason.match(/movidos:\s*(\d+)/)?.[1]
    return `No se puede cancelar: ${n ?? 'algunos'} ítem(s) ya se movieron (vendidos, reservados o apartados). Revertí esas operaciones primero.`
  }
  if (reason.includes('ya-cancelado')) return 'Este ingreso ya estaba cancelado.'
  if (reason.includes('permission')) return 'No tenés permiso para cancelar ingresos.'
  return reason
}

export function IngresosTable({
  initial,
  page,
  pageSize,
  total,
}: {
  initial: IngresoConResumen[]
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<IngresoConResumen | null>(null)

  function goToPage(nextPage: number) {
    const params = new URLSearchParams()
    if (nextPage > 1) params.set('page', String(nextPage))
    const qs = params.toString()
    router.push(qs ? `/inventario/ingresos?${qs}` : '/inventario/ingresos')
  }

  function cancelar() {
    const row = target
    setTarget(null)
    if (!row) return
    start(async () => {
      const res = await cancelarIngresoAction({ idIngreso: row.id_ingreso })
      if (!res.ok) return toast.error('No se pudo cancelar', explicar(res.reason))
      if (res.data?.modo === 'borrador') {
        setRows((rs) => rs.filter((r) => r.id_ingreso !== row.id_ingreso))
        toast.success('Borrador eliminado')
      } else {
        setRows((rs) =>
          rs.map((r) =>
            r.id_ingreso === row.id_ingreso ? { ...r, cancelado_at: new Date().toISOString() } : r,
          ),
        )
        toast.success('Ingreso cancelado', `${res.data?.itemsBaja ?? 0} ítem(s) dados de baja`)
      }
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <p className="font-display text-lg mb-2">Sin ingresos registrados</p>
        <p className="text-sm text-muted mb-4">
          Registrá el primer ingreso de mercadería (compra o consignación).
        </p>
        <Link
          href="/inventario/ingresos/nuevo"
          className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
        >
          Nuevo ingreso
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Proveedor</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Remito</th>
            <th className="px-4 py-3 text-right">Líneas</th>
            <th className="px-4 py-3 text-right">Unidades</th>
            <th className="px-4 py-3 text-right">Costo total</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cancelado = !!r.cancelado_at
            return (
              <tr key={r.id_ingreso} className="border-b border-border-2">
                <td className="px-4 py-3">{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                <td className="px-4 py-3">{r.proveedor?.nombre ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={r.tipo_ingreso === 'compra' ? 'info' : 'warning'}>{r.tipo_ingreso}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.numero_remito ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{r.total_lineas}</td>
                <td className="px-4 py-3 text-right font-mono">{r.total_cantidad}</td>
                <td className="px-4 py-3 text-right font-mono">
                  $ {r.total_costo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  {cancelado ? (
                    <Badge variant="neutral">Cancelado</Badge>
                  ) : (
                    <Badge variant={r.confirmado ? 'success' : 'neutral'}>
                      {r.confirmado ? 'Confirmado' : 'Borrador'}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/inventario/ingresos/${r.id_ingreso}`}
                      className="text-sm text-pink-strong hover:underline"
                    >
                      Abrir
                    </Link>
                    {!cancelado && (
                      <button
                        type="button"
                        onClick={() => setTarget(r)}
                        disabled={pending}
                        className="text-sm text-muted hover:text-text disabled:opacity-50"
                      >
                        {r.confirmado ? 'Cancelar' : 'Eliminar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={goToPage}
        disabled={pending}
      />

      <ConfirmDialog
        open={!!target}
        title={target?.confirmado ? 'Cancelar ingreso' : 'Eliminar borrador'}
        description={
          target?.confirmado
            ? 'Esto da de baja TODOS los ítems de este ingreso y lo marca como cancelado. Solo funciona si ningún ítem se vendió, reservó o apartó. No se puede deshacer.'
            : 'Se elimina este borrador y sus líneas. No genera stock, así que no afecta al inventario.'
        }
        confirmLabel={target?.confirmado ? 'Cancelar ingreso' : 'Eliminar'}
        cancelLabel="Volver"
        onConfirm={cancelar}
        onCancel={() => setTarget(null)}
      />
    </div>
  )
}

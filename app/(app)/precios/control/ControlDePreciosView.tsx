'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterBar } from '@/components/ui/FilterBar'
import { useToast } from '@/components/ui/Toast'
import type { ProductoConPrecioStatus } from '@/lib/types/precios'
import { recalcularBatchAction, recalcularPrecioAction } from '../actions'

type Filter = 'todos' | 'desactualizados' | 'sin-precio' | 'sin-regla'

export function ControlDePreciosView({
  initial,
}: {
  initial: ProductoConPrecioStatus[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('desactualizados')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'desactualizados' && !r.precio_venta_desactualizado) return false
      if (filter === 'sin-precio' && r.precio_venta != null) return false
      if (filter === 'sin-regla' && r.regla_margen_nombre != null) return false
      if (qLower) {
        const hay = `${r.nombre} ${r.sku ?? ''} ${r.categoria_nombre ?? ''}`.toLowerCase()
        if (!hay.includes(qLower)) return false
      }
      return true
    })
  }, [rows, q, filter])

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((r) => r.id_producto)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function recalcularUno(id: string) {
    start(async () => {
      const res = await recalcularPrecioAction(id)
      if (!res.ok) return toast.error('No se pudo recalcular', res.reason)
      toast.success('Precio actualizado')
      setRows((rs) =>
        rs.map((r) =>
          r.id_producto === id
            ? {
                ...r,
                precio_venta: res.data?.precio ?? null,
                precio_venta_desactualizado: false,
                precio_venta_resuelto_at: new Date().toISOString(),
              }
            : r,
        ),
      )
      router.refresh()
    })
  }

  function recalcularSeleccion() {
    const ids = Array.from(selected)
    if (ids.length === 0) return toast.error('Seleccioná al menos uno')
    start(async () => {
      const res = await recalcularBatchAction(ids)
      if (!res.ok) return toast.error('No se pudo recalcular', res.reason)
      const map = res.data!.resultados
      const okCount = Object.values(map).filter((v) => v != null).length
      toast.success(`Actualizados ${okCount} / ${ids.length}`)
      setRows((rs) =>
        rs.map((r) =>
          map[r.id_producto] !== undefined
            ? {
                ...r,
                precio_venta: map[r.id_producto],
                precio_venta_desactualizado: false,
                precio_venta_resuelto_at: new Date().toISOString(),
              }
            : r,
        ),
      )
      clearSelection()
      router.refresh()
    })
  }

  const fmt = (n: number | null) =>
    n == null ? '—' : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <FilterBar
              value={q}
              onChange={setQ}
              placeholder="Buscar por nombre, SKU o categoría"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <option value="todos">Todos</option>
            <option value="desactualizados">Solo desactualizados</option>
            <option value="sin-precio">Sin precio de venta</option>
            <option value="sin-regla">Sin regla de margen</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{selected.size} seleccionados</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={selectAllVisible}
            disabled={filtered.length === 0}
          >
            Seleccionar visibles
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={clearSelection}
            disabled={selected.size === 0}
          >
            Limpiar
          </Button>
          <Button onClick={recalcularSeleccion} disabled={pending || selected.size === 0}>
            {pending ? 'Recalculando…' : `Recalcular ${selected.size}`}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3">Producto</th>
              <th className="px-3 py-3">Categoría</th>
              <th className="px-3 py-3">Regla margen</th>
              <th className="px-3 py-3 text-right">Costo</th>
              <th className="px-3 py-3 text-right">Precio actual</th>
              <th className="px-3 py-3 text-right">Precio proyectado</th>
              <th className="px-3 py-3 text-right">Δ%</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted">
                  Nada para mostrar con los filtros actuales.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const desactualizado = r.precio_venta_desactualizado
                const sinPrecio = r.precio_venta == null
                return (
                  <tr
                    key={r.id_producto}
                    className={`border-b border-border-2 ${
                      selected.has(r.id_producto) ? 'bg-pink-bg/40' : ''
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${r.nombre}`}
                        checked={selected.has(r.id_producto)}
                        onChange={() => toggleSelected(r.id_producto)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{r.nombre}</div>
                      {r.sku && <div className="font-mono text-xs text-muted">{r.sku}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {r.categoria_nombre ?? <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r.regla_margen_nombre ?? (
                        <span className="text-muted-2 italic">Sin regla → costo</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.costo_vigente)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.precio_venta)}</td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.precio_proyectado)}</td>
                    <td className="px-3 py-3 text-right font-mono">
                      {r.diferencia_pct == null ? (
                        <span className="text-muted-2">—</span>
                      ) : (
                        <span
                          className={
                            r.diferencia_pct > 0
                              ? 'text-success'
                              : r.diferencia_pct < 0
                                ? 'text-pink-strong'
                                : ''
                          }
                        >
                          {r.diferencia_pct > 0 ? '+' : ''}
                          {r.diferencia_pct}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {sinPrecio ? (
                        <Badge variant="danger">Sin precio</Badge>
                      ) : desactualizado ? (
                        <Badge variant="warning">Desactualizado</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => recalcularUno(r.id_producto)}
                        disabled={pending || r.costo_vigente == null}
                      >
                        Recalcular
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

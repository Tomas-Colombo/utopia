'use client'

import { useMemo, useState } from 'react'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import type { RotacionRow } from '@/lib/types/reportes'

const PAGE_SIZE = 25
type Orden = 'unidades_desc' | 'unidades_asc' | 'monto_desc' | 'monto_asc' | 'ganancia_desc' | 'ganancia_asc' | 'nombre_asc'

export function RotacionTable({ rows }: { rows: RotacionRow[] }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [orden, setOrden] = useState<Orden>('unidades_desc')
  const [page, setPage] = useState(1)

  const categorias = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.categoria_nombre) set.add(r.categoria_nombre)
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [rows])

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    const base = rows.filter((r) => {
      if (cat && r.categoria_nombre !== cat) return false
      if (!term) return true
      return (
        r.nombre.toLowerCase().includes(term) ||
        (r.sku ?? '').toLowerCase().includes(term)
      )
    })
    const sorted = [...base].sort((a, b) => {
      switch (orden) {
        case 'unidades_desc': return b.unidades_vendidas - a.unidades_vendidas
        case 'unidades_asc': return a.unidades_vendidas - b.unidades_vendidas
        case 'monto_desc': return b.monto_vendido - a.monto_vendido
        case 'monto_asc': return a.monto_vendido - b.monto_vendido
        case 'ganancia_desc': return b.monto_ganancia - a.monto_ganancia
        case 'ganancia_asc': return a.monto_ganancia - b.monto_ganancia
        case 'nombre_asc': return a.nombre.localeCompare(b.nombre, 'es')
      }
    })
    return sorted
  }, [rows, q, cat, orden])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const pagina = Math.min(page, totalPaginas)
  const desde = (pagina - 1) * PAGE_SIZE
  const slice = filtradas.slice(desde, desde + PAGE_SIZE)

  function reset<T extends string>(setter: (v: T) => void, v: T) {
    setter(v)
    setPage(1)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Field htmlFor="rot-q" label="Buscar">
            <Input
              id="rot-q"
              value={q}
              onChange={(e) => reset(setQ, e.target.value)}
              placeholder="Nombre o SKU"
            />
          </Field>
        </div>
        <div className="w-56">
          <Field htmlFor="rot-cat" label="Categoría">
            <select
              id="rot-cat"
              value={cat}
              onChange={(e) => reset(setCat, e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-56">
          <Field htmlFor="rot-orden" label="Ordenar por">
            <select
              id="rot-orden"
              value={orden}
              onChange={(e) => reset<Orden>(setOrden, e.target.value as Orden)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="unidades_desc">Unidades (mayor a menor)</option>
              <option value="unidades_asc">Unidades (menor a mayor)</option>
              <option value="monto_desc">Vendido (mayor a menor)</option>
              <option value="monto_asc">Vendido (menor a mayor)</option>
              <option value="ganancia_desc">Ganancia (mayor a menor)</option>
              <option value="ganancia_asc">Ganancia (menor a mayor)</option>
              <option value="nombre_asc">Nombre (A→Z)</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {slice.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Sin productos que coincidan con los filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Unidades</th>
                <th className="px-4 py-3 text-right">Vendido</th>
                <th className="px-4 py-3 text-right">Ganancia</th>
                <th className="px-4 py-3 text-right">Ticket prom.</th>
                <th className="px-4 py-3">Última venta</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id_producto} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.nombre}</div>
                    {r.sku && <div className="text-xs font-mono text-muted">{r.sku}</div>}
                  </td>
                  <td className="px-4 py-3">{r.categoria_nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.unidades_vendidas}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMoney(r.monto_vendido)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={r.monto_ganancia < 0 ? 'text-pink-strong' : ''}>
                      {fmtMoney(r.monto_ganancia)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {fmtMoney(r.ticket_promedio)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {r.ultima_venta ? new Date(r.ultima_venta).toLocaleDateString('es-AR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={pagina}
        pageSize={PAGE_SIZE}
        total={filtradas.length}
        onPageChange={setPage}
      />
    </div>
  )
}

function fmtMoney(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import type { GastoConCategoria } from '@/lib/types/rendiciones'
import type { GastosOrden } from '@/lib/dal/gastos/gasto'

interface CatOpt { id: string; nombre: string }

/**
 * Listado de gastos con filtros por fecha, categoría y orden, todos
 * sincronizados a la URL. La paginación es server-side (`listGastosPaginado`)
 * para escalar aunque el histórico crezca.
 */
export function GastosTableClient({
  rows,
  categorias,
  initialDesde,
  initialHasta,
  initialCategoria,
  initialOrden,
  page,
  pageSize,
  total,
}: {
  rows: GastoConCategoria[]
  categorias: CatOpt[]
  initialDesde: string
  initialHasta: string
  initialCategoria: string
  initialOrden: GastosOrden
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [desde, setDesde] = useState(initialDesde)
  const [hasta, setHasta] = useState(initialHasta)
  const [cat, setCat] = useState(initialCategoria)
  const [orden, setOrden] = useState<GastosOrden>(initialOrden)

  const invertido = desde && hasta && desde > hasta

  function navigate(params: URLSearchParams) {
    const qs = params.toString()
    startTransition(() => router.push(qs ? `/gastos?${qs}` : '/gastos'))
  }

  function buildParams(nextPage: number, next: {
    desde?: string; hasta?: string; cat?: string; orden?: GastosOrden
  } = {}) {
    const d = next.desde ?? desde
    const h = next.hasta ?? hasta
    const c = next.cat ?? cat
    const o = next.orden ?? orden
    const params = new URLSearchParams()
    if (d) params.set('desde', d)
    if (h) params.set('hasta', h)
    if (c) params.set('cat', c)
    if (o && o !== 'fecha_desc') params.set('orden', o)
    if (nextPage > 1) params.set('page', String(nextPage))
    return params
  }

  function aplicar() {
    if (invertido) return
    navigate(buildParams(1))
  }

  function limpiar() {
    setDesde('')
    setHasta('')
    setCat('')
    setOrden('fecha_desc')
    navigate(new URLSearchParams())
  }

  function goToPage(nextPage: number) {
    navigate(buildParams(nextPage))
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aplicar()
        }}
        className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
        aria-label="Filtrar gastos"
      >
        <div className="w-40">
          <Field
            htmlFor="g-desde"
            label="Desde"
            error={invertido ? 'Posterior a "Hasta"' : undefined}
          >
            <Input
              id="g-desde"
              type="date"
              value={desde}
              max={hasta || undefined}
              invalid={!!invertido}
              onChange={(e) => setDesde(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field htmlFor="g-hasta" label="Hasta">
            <Input
              id="g-hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field htmlFor="g-cat-f" label="Categoría">
            <select
              id="g-cat-f"
              value={cat}
              onChange={(e) => {
                setCat(e.target.value)
                navigate(buildParams(1, { cat: e.target.value }))
              }}
              disabled={pending}
              className="w-full"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-48">
          <Field htmlFor="g-orden" label="Ordenar por">
            <select
              id="g-orden"
              value={orden}
              onChange={(e) => {
                const o = e.target.value as GastosOrden
                setOrden(o)
                navigate(buildParams(1, { orden: o }))
              }}
              disabled={pending}
              className="w-full"
            >
              <option value="fecha_desc">Fecha (más reciente)</option>
              <option value="fecha_asc">Fecha (más antiguo)</option>
              <option value="monto_desc">Monto (mayor a menor)</option>
              <option value="monto_asc">Monto (menor a mayor)</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button type="button" variant="secondary" onClick={limpiar} disabled={pending}>
            Limpiar
          </Button>
          <Button type="submit" disabled={pending || !!invertido}>
            {pending ? 'Filtrando…' : 'Aplicar'}
          </Button>
        </div>
      </form>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Sin gastos que coincidan con los filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Comprobante</th>
                <th className="px-4 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id_gasto} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    {new Date(g.fecha).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3">{g.categoria?.nombre ?? '—'}</td>
                  <td className="px-4 py-3">{g.descripcion}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {g.comprobante_ref ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    $ {Number(g.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={goToPage}
        disabled={pending}
      />
    </div>
  )
}

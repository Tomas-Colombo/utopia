'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BuscadorProductos, type SugerenciaProducto } from '@/components/inventario/BuscadorProductos'
import { Pagination } from '@/components/ui/Pagination'
import { Table, type Column } from '@/components/ui/Table'
import { normalizar } from '@/lib/inventario/producto-match'
import type { ProductoBuscadorItem } from '@/lib/dal/inventario/producto'
import type { CategoriaRow } from '@/lib/types/inventario'
import type { GananciaPorProductoRow } from '@/lib/types/reportes'

export function GananciaProyectadaClient({
  rows,
  catalogo,
  categorias,
  initialSearch,
  initialCategoria,
  page,
  pageSize,
  total,
  basePath = '/precios',
}: {
  rows: GananciaPorProductoRow[]
  catalogo: ProductoBuscadorItem[]
  categorias: CategoriaRow[]
  initialSearch: string
  initialCategoria: string
  page: number
  pageSize: number
  total: number
  basePath?: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialSearch)
  const [cat, setCat] = useState(initialCategoria)
  const [pending, startTransition] = useTransition()

  const sugerencias = useMemo<SugerenciaProducto[]>(() => {
    const term = normalizar(q)
    if (!term) return []
    return catalogo
      .filter(
        (p) =>
          normalizar(p.nombre).includes(term) ||
          (p.sku ? normalizar(p.sku).includes(term) : false),
      )
      .slice(0, 8)
      .map((p) => ({ id: p.id_producto, nombre: p.nombre, sku: p.sku }))
  }, [catalogo, q])

  function navigate(params: URLSearchParams) {
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath)
    })
  }

  function applyFilters(nextQ = q, nextCat = cat) {
    const params = new URLSearchParams()
    if (nextQ.trim()) params.set('gq', nextQ.trim())
    if (nextCat) params.set('gcat', nextCat)
    navigate(params)
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams()
    if (q.trim()) params.set('gq', q.trim())
    if (cat) params.set('gcat', cat)
    if (nextPage > 1) params.set('gpage', String(nextPage))
    navigate(params)
  }

  function elegirSugerencia(s: SugerenciaProducto) {
    setQ(s.nombre)
    applyFilters(s.nombre)
  }

  function buscarLibre(texto: string) {
    applyFilters(texto)
  }

  const fmtMoney = (n: number | null) =>
    n == null ? '—' : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

  const columns: Column<GananciaPorProductoRow>[] = [
    {
      key: 'nombre',
      label: 'Producto',
      render: (r) => (
        <div>
          <div className="font-medium">{r.nombre}</div>
          {r.sku && <div className="text-xs font-mono text-muted">{r.sku}</div>}
        </div>
      ),
    },
    {
      key: 'categoria',
      label: 'Categoría',
      render: (r) => r.categoria_nombre ?? <span className="text-muted-2">—</span>,
    },
    {
      key: 'costo',
      label: 'Costo',
      align: 'right',
      render: (r) => <span className="font-mono text-muted">{fmtMoney(r.costo_vigente)}</span>,
    },
    {
      key: 'precio',
      label: 'Precio venta',
      align: 'right',
      render: (r) => <span className="font-mono">{fmtMoney(r.precio_venta)}</span>,
    },
    {
      key: 'ganancia',
      label: 'Ganancia u.',
      align: 'right',
      render: (r) => <span className="font-mono">{fmtMoney(r.ganancia_unitaria)}</span>,
    },
    {
      key: 'margen',
      label: 'Margen',
      align: 'right',
      render: (r) => (
        <span className="font-mono">
          {r.margen_pct != null ? `${r.margen_pct}%` : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <BuscadorProductos
        id="ganancia-buscador"
        label="Buscar producto"
        hint="Nombre o SKU. Enter aplica el filtro."
        placeholder="Buscar por nombre o SKU"
        value={q}
        onChange={setQ}
        sugerencias={sugerencias}
        onElegir={elegirSugerencia}
        onSubmit={buscarLibre}
        disabled={pending}
        actions={
          <>
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value)
                applyFilters(q, e.target.value)
              }}
              className=""
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c.id_categoria} value={c.id_categoria}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => applyFilters()}
              className="shrink-0 rounded-md border border-border bg-card px-4 py-2 text-sm text-text hover:bg-card-2"
            >
              Aplicar
            </button>
          </>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table
          columns={columns}
          data={rows}
          loading={pending}
          getRowId={(r) => r.id_producto}
          emptyState="Sin productos que coincidan con los filtros"
        />
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

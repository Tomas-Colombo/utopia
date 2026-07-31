'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Table, type Column } from '@/components/ui/Table'
import type { CategoriaRow, ProductoConDetalle } from '@/lib/types/inventario'

export function ProductosTableClient({
  rows,
  categorias,
  initialSearch,
  initialCategoria,
  page,
  pageSize,
  total,
  basePath = '/inventario/productos',
  scanHref,
}: {
  rows: ProductoConDetalle[]
  categorias: CategoriaRow[]
  initialSearch: string
  initialCategoria: string
  page: number
  pageSize: number
  total: number
  /** Ruta a la que se sincronizan los filtros. La home de inventario reusa
   *  esta tabla, así que el listado vive en `/inventario`, no en `/inventario/productos`. */
  basePath?: string
  /** Si se pasa, muestra un botón de cámara (escaneo) en la barra de búsqueda. */
  scanHref?: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialSearch)
  const [cat, setCat] = useState(initialCategoria)
  const [pending, startTransition] = useTransition()

  function navigate(params: URLSearchParams) {
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath)
    })
  }

  // Cambiar filtros vuelve a la página 1: el `page` actual dejaría de tener
  // sentido con un conjunto de resultados distinto.
  function applyFilters(nextQ = q, nextCat = cat) {
    const params = new URLSearchParams()
    if (nextQ.trim()) params.set('q', nextQ.trim())
    if (nextCat) params.set('cat', nextCat)
    navigate(params)
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (cat) params.set('cat', cat)
    if (nextPage > 1) params.set('page', String(nextPage))
    navigate(params)
  }

  const columns: Column<ProductoConDetalle>[] = [
    { key: 'nombre', label: 'Producto', render: (r) => <span className="font-medium">{r.nombre}</span> },
    {
      key: 'sku',
      label: 'SKU',
      render: (r) => (r.sku ? <span className="font-mono text-xs">{r.sku}</span> : <span className="text-muted-2">—</span>),
    },
    {
      key: 'categoria',
      label: 'Categoría',
      render: (r) => r.categoria?.nombre ?? <span className="text-muted-2">—</span>,
    },
    {
      key: 'costo_vigente',
      label: 'Costo',
      align: 'right',
      render: (r) =>
        r.costo_vigente != null ? (
          <span className="font-mono">
            {r.moneda_vigente ?? '$'} {r.costo_vigente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-muted-2">—</span>
        ),
    },
    {
      key: 'stock_disponible',
      label: 'Stock',
      align: 'right',
      render: (r) => {
        const bajo = r.stock_disponible < r.stock_minimo
        return (
          <div className="flex items-center justify-end gap-2">
            <span className="font-mono">
              {r.stock_disponible} / {r.stock_total}
            </span>
            {bajo && <Badge variant="warning">Bajo mín.</Badge>}
          </div>
        )
      },
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (r) => (
        <Link
          href={`/inventario/productos/${r.id_producto}`}
          className="text-sm text-pink-strong hover:underline"
        >
          Editar
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      {/* Buscador único, compacto, en una sola línea. Enter aplica (form
          submit); FilterBar reporta cada tecla pero sincronizamos con la URL
          solo al enviar, para no golpear el server en cada tecla. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters()
        }}
        className="flex flex-wrap items-center gap-2"
      >
        {scanHref && (
          <Link
            href={scanHref}
            aria-label="Escanear con cámara"
            title="Escanear con cámara"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-text hover:bg-card-2"
          >
            <span aria-hidden>📷</span>
            <span className="hidden sm:inline">Escanear</span>
          </Link>
        )}
        <div className="min-w-[12rem] flex-1">
          <FilterBar value={q} onChange={setQ} placeholder="Buscar por nombre o SKU" />
        </div>
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value)
            applyFilters(q, e.target.value)
          }}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id_categoria} value={c.id_categoria}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="shrink-0 rounded-md border border-border bg-card px-4 py-2 text-sm text-text hover:bg-card-2"
        >
          Aplicar
        </button>
      </form>

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

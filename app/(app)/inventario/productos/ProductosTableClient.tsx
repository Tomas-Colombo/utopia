'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { FilterBar } from '@/components/ui/FilterBar'
import { Table, type Column } from '@/components/ui/Table'
import type { CategoriaRow, ProductoConDetalle } from '@/lib/types/inventario'

export function ProductosTableClient({
  rows,
  categorias,
  initialSearch,
  initialCategoria,
}: {
  rows: ProductoConDetalle[]
  categorias: CategoriaRow[]
  initialSearch: string
  initialCategoria: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialSearch)
  const [cat, setCat] = useState(initialCategoria)

  function applyFilters(nextQ = q, nextCat = cat) {
    const params = new URLSearchParams()
    if (nextQ.trim()) params.set('q', nextQ.trim())
    if (nextCat) params.set('cat', nextCat)
    const qs = params.toString()
    router.push(qs ? `/inventario/productos?${qs}` : '/inventario/productos')
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <FilterBar
            value={q}
            onChange={(v) => {
              setQ(v)
              // Aplico filtros al pedir Enter o cambiar categoría; FilterBar
              // dispara por keystroke pero para no golpear el server en cada
              // tecla, sincronizo con URL solo al blur/submit.
            }}
            placeholder="Buscar por nombre o SKU"
          />
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
          type="button"
          onClick={() => applyFilters()}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm text-text hover:bg-card-2"
        >
          Aplicar
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table
          columns={columns}
          data={rows}
          getRowId={(r) => r.id_producto}
          emptyState="Sin productos que coincidan con los filtros"
        />
      </div>
    </div>
  )
}

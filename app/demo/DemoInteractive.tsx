'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { SearchableSelect, type Option } from '@/components/ui/SearchableSelect'
import { Table, type Column } from '@/components/ui/Table'

export interface Product {
  id: string
  name: string
  status: 'active' | 'out-of-stock' | 'discontinued'
  price: number
}

const STATUS_VARIANT: Record<Product['status'], 'success' | 'warning' | 'danger'> = {
  active: 'success',
  'out-of-stock': 'warning',
  discontinued: 'danger',
}

const STATUS_LABEL: Record<Product['status'], string> = {
  active: 'Active',
  'out-of-stock': 'Out of stock',
  discontinued: 'Discontinued',
}

const STATUS_OPTIONS: Option[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'out-of-stock', label: 'Out of stock' },
  { value: 'discontinued', label: 'Discontinued' },
]

const columns: Column<Product>[] = [
  { key: 'name', label: 'Name' },
  {
    key: 'status',
    label: 'Status',
    align: 'center',
    render: (item) => <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>,
  },
  {
    key: 'price',
    label: 'Price',
    align: 'right',
    render: (item) => `$${item.price.toLocaleString('en-US')}`,
  },
]

/**
 * Owns every piece of state the demo needs (search text, status filter,
 * loading toggle, confirm-dialog open flag). Extracted from the Server
 * Component `page.tsx` because these interactions need hooks/event handlers
 * (design §8.8, `'use client'` boundary rule).
 */
export function DemoInteractive({ products }: { products: Product[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const filtered = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [products, search, statusFilter])

  const filtersActive = search !== '' || statusFilter !== 'all'

  function handleClearFilters() {
    setSearch('')
    setStatusFilter('all')
  }

  return (
    <>
      <section>
        <h2 className="font-display text-xl text-text">SearchableSelect + FilterBar</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchableSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter products by status"
          />
          <label className="flex-1">
            <span className="sr-only">Search products by name</span>
            <FilterBar value={search} onChange={setSearch} placeholder="Search products..." />
          </label>
          {filtersActive && (
            // text-text (not text-terracota): terracota fails AA as small
            // standalone text on the light bg (verified ~3.2:1); the
            // terracota accent is applied only to the underline decoration.
            <button
              type="button"
              onClick={handleClearFilters}
              className="whitespace-nowrap text-sm font-semibold text-text underline decoration-terracota underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-text">Table</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={loading}
              onChange={(event) => setLoading(event.target.checked)}
            />
            Simulate loading
          </label>
        </div>
        <div className="mt-4 rounded-md border border-border bg-card">
          <Table
            columns={columns}
            data={filtered}
            loading={loading}
            getRowId={(item) => item.id}
            emptyState={
              <EmptyState
                title="No products match your filters"
                description="Try a different search term or clear the filters."
                cta={{ label: 'Clear filters', onClick: handleClearFilters }}
              />
            }
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">EmptyState</h2>
        <div className="mt-4 rounded-md border border-border bg-card">
          <EmptyState
            title="No pending orders"
            description="New orders will appear here as soon as they come in."
            cta={{ label: 'Create order', onClick: () => console.log('demo: create order clicked') }}
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">ConfirmDialog</h2>
        {/* text-sidebar, not text-bg — see Badge.tsx contrast note. */}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-4 rounded-md bg-pink-strong px-4 py-2 text-sm font-semibold text-sidebar"
        >
          Delete product
        </button>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete this product?"
          description="This action cannot be undone."
          variant="danger"
          confirmLabel="Delete"
          onConfirm={() => {
            console.log('demo: confirmed delete')
            setConfirmOpen(false)
          }}
          onCancel={() => {
            console.log('demo: cancelled delete')
            setConfirmOpen(false)
          }}
        />
      </section>
    </>
  )
}

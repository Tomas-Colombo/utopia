'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import { Skeleton } from './Skeleton'
import { DataTable, TBody, Td, Th, THead, Tr } from './TableParts'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  render?: (item: T) => ReactNode
}

export interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyState?: ReactNode
  onRowClick?: (item: T) => void
  getRowId?: (item: T) => string
}

/**
 * Uses native `<table>` markup so `role="table"`/`"columnheader"`/`"cell"`
 * come from the browser's implicit ARIA mapping (REQ-DS-10). Sorting is out
 * of scope for this slice (list-view enhancement work).
 */
export function Table<T extends object>({
  columns,
  data,
  loading = false,
  emptyState,
  onRowClick,
  getRowId,
}: TableProps<T>) {
  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, item: T) {
    if (event.key === 'Enter') {
      event.preventDefault()
      onRowClick?.(item)
    }
  }

  return (
    <DataTable>
      <THead>
        {columns.map((column) => (
          <Th key={column.key} align={column.align ?? 'left'}>
            {column.label}
          </Th>
        ))}
      </THead>
      <TBody>
        {loading ? (
          Array.from({ length: 3 }).map((_, rowIndex) => (
            <Tr key={`skeleton-row-${rowIndex}`} data-testid="table-loading-row">
              <Td colSpan={columns.length} className="px-4 py-3.5">
                <Skeleton width="100%" height="1rem" />
              </Td>
            </Tr>
          ))
        ) : data.length === 0 ? (
          <Tr>
            <Td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted">
              {emptyState ?? 'No data'}
            </Td>
          </Tr>
        ) : (
          data.map((item, index) => {
            const rowId = getRowId ? getRowId(item) : String(index)
            const rowProps = onRowClick
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  onClick: () => onRowClick(item),
                  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) =>
                    handleRowKeyDown(event, item),
                }
              : {}

            return (
              <Tr
                key={rowId}
                className={
                  onRowClick
                    ? 'cursor-pointer focus:outline-none focus-visible:bg-hover focus-visible:shadow-[inset_2px_0_0_var(--ink)]'
                    : ''
                }
                {...rowProps}
              >
                {columns.map((column) => (
                  <Td key={column.key} align={column.align ?? 'left'}>
                    {column.render
                      ? column.render(item)
                      : String((item as Record<string, unknown>)[column.key] ?? '')}
                  </Td>
                ))}
              </Tr>
            )
          })
        )}
      </TBody>
    </DataTable>
  )
}

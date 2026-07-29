'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import { Skeleton } from './Skeleton'

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

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
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
    <table className="w-full border-collapse text-text">
      <thead>
        <tr className="border-b border-border">
          {columns.map((column) => {
            const align = column.align ?? 'left'
            return (
              <th
                key={column.key}
                data-align={align}
                className={`px-3 py-2 font-body ${ALIGN_CLASS[align]}`}
              >
                {column.label}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 3 }).map((_, rowIndex) => (
            <tr key={`skeleton-row-${rowIndex}`} data-testid="table-loading-row">
              <td colSpan={columns.length} className="px-3 py-2">
                <Skeleton width="100%" height="1rem" />
              </td>
            </tr>
          ))
        ) : data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-3 py-4 text-center text-muted">
              {emptyState ?? 'No data'}
            </td>
          </tr>
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
              <tr key={rowId} className="border-b border-border-2" {...rowProps}>
                {columns.map((column) => {
                  const align = column.align ?? 'left'
                  return (
                    <td
                      key={column.key}
                      data-align={align}
                      className={`px-3 py-2 ${ALIGN_CLASS[align]}`}
                    >
                      {column.render
                        ? column.render(item)
                        : String((item as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  )
                })}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

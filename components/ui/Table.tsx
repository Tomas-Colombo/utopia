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
    <table className="w-full border-collapse text-[13.5px] text-text">
      <thead>
        <tr className="border-b border-line bg-panel-2">
          {columns.map((column) => {
            const align = column.align ?? 'left'
            return (
              <th
                key={column.key}
                data-align={align}
                className={`whitespace-nowrap px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted ${ALIGN_CLASS[align]}`}
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
              <td colSpan={columns.length} className="px-4 py-3.5">
                <Skeleton width="100%" height="1rem" />
              </td>
            </tr>
          ))
        ) : data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted">
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
              <tr
                key={rowId}
                className={`border-b border-line transition-colors last:border-b-0 hover:bg-hover ${
                  onRowClick ? 'cursor-pointer focus:outline-none focus-visible:bg-hover focus-visible:shadow-[inset_2px_0_0_var(--ink)]' : ''
                }`}
                {...rowProps}
              >
                {columns.map((column) => {
                  const align = column.align ?? 'left'
                  return (
                    <td
                      key={column.key}
                      data-align={align}
                      className={`px-4 py-3 align-middle tabular-nums ${ALIGN_CLASS[align]}`}
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

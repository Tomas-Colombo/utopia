'use client'

/**
 * Presentational pager for server-paginated lists. Stateless: the parent owns
 * the current page (usually synced to the URL) and reacts to `onPageChange`.
 *
 * Renders nothing when everything fits on a single page, so callers can drop
 * it in unconditionally.
 */
export interface PaginationProps {
  /** 1-based current page. */
  page: number
  pageSize: number
  /** Total rows matching the current filters (across all pages). */
  total: number
  onPageChange: (page: number) => void
  /** Disable the controls while the parent is loading the next page. */
  disabled?: boolean
}

export function Pagination({ page, pageSize, total, onPageChange, disabled }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const current = Math.min(Math.max(1, page), totalPages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, total)

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-2 text-[13px] tabular-nums"
      aria-label="Paginación"
    >
      <p className="text-muted">
        Mostrando <span className="font-mono text-text">{from}</span>–
        <span className="font-mono text-text">{to}</span> de{' '}
        <span className="font-mono text-text">{total}</span>
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={disabled || current <= 1}
          className="rounded-md border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="text-muted" aria-current="page">
          Página <span className="font-mono text-text">{current}</span> de{' '}
          <span className="font-mono text-text">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={disabled || current >= totalPages}
          className="rounded-md border border-line-2 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Table, type Column } from './Table'

interface Row {
  id: string
  name: string
  amount: number
}

const columns: Column<Row>[] = [
  { key: 'name', label: 'Name' },
  { key: 'amount', label: 'Amount', align: 'right', render: (item) => `$${item.amount}` },
]

const data: Row[] = [
  { id: '1', name: 'Alice', amount: 10 },
  { id: '2', name: 'Bob', amount: 20 },
]

describe('Table', () => {
  it('renders the columns header row with the provided labels', () => {
    render(<Table columns={columns} data={data} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(2)
    expect(headers[0]).toHaveTextContent('Name')
    expect(headers[1]).toHaveTextContent('Amount')
  })

  it('renders one row per data item, using column.render when provided and item[key] otherwise', () => {
    render(<Table columns={columns} data={data} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('$10')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('$20')).toBeInTheDocument()
  })

  it('applies the configured text-alignment to a column via data-align', () => {
    render(<Table columns={columns} data={data} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers[0]).toHaveAttribute('data-align', 'left')
    expect(headers[1]).toHaveAttribute('data-align', 'right')

    const amountCells = screen.getAllByRole('cell').filter((cell) => cell.textContent?.startsWith('$'))
    expect(amountCells[0]).toHaveAttribute('data-align', 'right')
  })

  it('renders the emptyState slot when data is empty', () => {
    render(<Table columns={columns} data={[]} emptyState={<span>Nothing to show</span>} />)
    expect(screen.getByText('Nothing to show')).toBeInTheDocument()
  })

  it('falls back to a "No data" message when data is empty and no emptyState is given', () => {
    render(<Table columns={columns} data={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('renders Skeleton loading rows instead of data rows when loading is true', () => {
    render(<Table columns={columns} data={data} loading />)
    // Real Skeleton components (role="status", aria-busy) — not the old
    // `<div data-testid="table-loading">Loading...</div>` placeholder.
    const loadingIndicators = screen.getAllByRole('status')
    expect(loadingIndicators).toHaveLength(3)
    loadingIndicators.forEach((indicator) => {
      expect(indicator).toHaveAttribute('aria-busy', 'true')
    })
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('invokes onRowClick with the item when a row is clicked', async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(<Table columns={columns} data={data} onRowClick={onRowClick} />)

    await user.click(screen.getByText('Alice'))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('invokes onRowClick when Enter is pressed on a focused row (role=button, tabIndex=0)', async () => {
    const onRowClick = vi.fn()
    render(<Table columns={columns} data={data} onRowClick={onRowClick} />)

    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveAttribute('tabIndex', '0')

    rows[1].focus()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledWith(data[1])
  })

  it('does not make rows focusable/clickable buttons when onRowClick is absent', () => {
    render(<Table columns={columns} data={data} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('exposes table/columnheader/cell ARIA roles', () => {
    render(<Table columns={columns} data={data} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getAllByRole('cell')).toHaveLength(4)
  })
})

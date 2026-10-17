import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, TBody, Td, TFoot, Th, THead, TableFrame, Tr } from './TableParts'

function Sample({ onRowClick }: { onRowClick?: () => void }) {
  return (
    <TableFrame data-testid="frame">
      <DataTable>
        <THead>
          <Th>Name</Th>
          <Th align="right">Amount</Th>
        </THead>
        <TBody>
          <Tr onClick={onRowClick}>
            <Td>Alice</Td>
            <Td align="right">$10</Td>
          </Tr>
        </TBody>
        <TFoot>
          <Tr>
            <Td colSpan={2}>Total</Td>
          </Tr>
        </TFoot>
      </DataTable>
    </TableFrame>
  )
}

describe('TableParts', () => {
  it('renders native table semantics: table, column headers, rows and cells', () => {
    render(<Sample />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Amount'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('cell', { name: 'Alice' })).toBeInTheDocument()
  })

  it('exposes alignment through data-align, defaulting headers to left', () => {
    render(<Sample />)
    const [name, amount] = screen.getAllByRole('columnheader')
    expect(name).toHaveAttribute('data-align', 'left')
    expect(amount).toHaveAttribute('data-align', 'right')
    expect(screen.getByRole('cell', { name: '$10' })).toHaveAttribute('data-align', 'right')
    // An unaligned cell inherits from its row instead of forcing left.
    expect(screen.getByRole('cell', { name: 'Alice' })).not.toHaveAttribute('data-align')
  })

  it('forwards native props such as colSpan and onClick', async () => {
    const onRowClick = vi.fn()
    render(<Sample onRowClick={onRowClick} />)
    expect(screen.getByRole('cell', { name: 'Total' })).toHaveAttribute('colspan', '2')

    await userEvent.setup().click(screen.getByRole('cell', { name: 'Alice' }))
    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('appends className and lets a cell replace the default padding', () => {
    render(
      <DataTable className="min-w-[900px]">
        <TBody>
          <Tr>
            <Td className="px-2 py-1">Dense</Td>
            <Td>Default</Td>
          </Tr>
        </TBody>
      </DataTable>,
    )
    expect(screen.getByRole('table')).toHaveClass('w-full', 'min-w-[900px]')
    const dense = screen.getByRole('cell', { name: 'Dense' })
    expect(dense).toHaveClass('px-2', 'py-1')
    expect(dense).not.toHaveClass('px-4')
    expect(screen.getByRole('cell', { name: 'Default' })).toHaveClass('px-4', 'py-3')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from './FilterBar'

describe('FilterBar', () => {
  it('renders an input field with the placeholder', () => {
    render(<FilterBar value="" onChange={vi.fn()} placeholder="Search items" />)
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search items')
  })

  it('calls onChange with the typed value as the user types (no debounce)', () => {
    const onChange = vi.fn()
    render(<FilterBar value="" onChange={onChange} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('Escape clears the input and fires onChange("")', () => {
    const onChange = vi.fn()
    render(<FilterBar value="something" onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('shows the Clear button only when the input is non-empty', () => {
    const { rerender } = render(<FilterBar value="" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Clear filter' })).not.toBeInTheDocument()

    rerender(<FilterBar value="abc" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeInTheDocument()
  })

  it('clicking Clear empties the input and fires onChange("")', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<FilterBar value="abc" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('pressing "/" anywhere in the container focuses the input', () => {
    render(<FilterBar value="" onChange={vi.fn()} />)
    const container = screen.getByTestId('filter-bar')

    fireEvent.keyDown(container, { key: '/' })
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('does not focus the input on "/" when keyboardShortcut is false', () => {
    render(<FilterBar value="" onChange={vi.fn()} keyboardShortcut={false} />)
    const container = screen.getByTestId('filter-bar')

    fireEvent.keyDown(container, { key: '/' })
    expect(screen.getByRole('searchbox')).not.toHaveFocus()
  })

  it('exposes ARIA: input role=searchbox, clear button aria-label="Clear filter"', () => {
    render(<FilterBar value="abc" onChange={vi.fn()} />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filter' })).toHaveAttribute(
      'aria-label',
      'Clear filter',
    )
  })
})

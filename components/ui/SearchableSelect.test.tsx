import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchableSelect, type Option } from './SearchableSelect'

const options: Option[] = [
  { value: 'inv', label: 'Inventario' },
  { value: 'ven', label: 'Ventas' },
  { value: 'pre', label: 'Precios', disabled: true },
  { value: 'con', label: 'Consignaciones' },
]

describe('SearchableSelect', () => {
  it('renders a trigger button with the placeholder when no option is selected', () => {
    render(<SearchableSelect options={options} onChange={vi.fn()} placeholder="Select a module" />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Select a module')
  })

  it('opens a listbox when clicked', async () => {
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={vi.fn()} placeholder="Select a module" />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it("filters options by the user's search input (case-insensitive)", async () => {
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={vi.fn()} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    // Search "CONS" — matches only "Consignaciones" (avoids ambiguity: "ven" also
    // matches "Inventario", so "VEN" would return 2 results; "cons" is unambiguous).
    await user.type(screen.getByRole('searchbox'), 'CONS')

    const visibleOptions = screen.getAllByRole('option')
    expect(visibleOptions).toHaveLength(1)
    expect(visibleOptions[0]).toHaveTextContent('Consignaciones')
  })

  it('keyboard navigation: ArrowDown moves highlight, Enter selects the highlighted option', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={onChange} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    const searchInput = screen.getByRole('searchbox')
    const renderedOptions = screen.getAllByRole('option')
    // Initial highlight is the first enabled option (Inventario).
    expect(searchInput).toHaveAttribute('aria-activedescendant', renderedOptions[0].id)

    await user.keyboard('{ArrowDown}')
    expect(searchInput).toHaveAttribute('aria-activedescendant', renderedOptions[1].id)

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('ven')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('keyboard navigation: ArrowUp moves highlight back up', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={onChange} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('inv')
  })

  it('keyboard: Escape closes the listbox without selecting', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={onChange} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled options cannot be selected and are marked aria-disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={onChange} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    const disabledOption = screen.getByText('Precios')
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true')

    await user.click(disabledOption)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('shows a "No results" message when the search yields no matches', async () => {
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={vi.fn()} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    await user.type(screen.getByRole('searchbox'), 'zzzzz')

    expect(screen.getByText('No results')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('selecting an option via click calls onChange and closes the listbox', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchableSelect options={options} onChange={onChange} placeholder="Select a module" />)
    await user.click(screen.getByRole('combobox'))

    await user.click(screen.getByText('Consignaciones'))

    expect(onChange).toHaveBeenCalledWith('con')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('exposes combobox/listbox/option ARIA roles and attributes', async () => {
    const user = userEvent.setup()
    render(<SearchableSelect options={options} value="ven" onChange={vi.fn()} placeholder="Select a module" />)

    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)

    // When value="ven" is committed, the trigger text ALSO says "Ventas",
    // so we scope the lookup to options (role=option) to avoid the duplicate.
    const optionElements = screen.getAllByRole('option')
    const selected = optionElements.find((el) => el.textContent === 'Ventas')
    const inventario = optionElements.find((el) => el.textContent === 'Inventario')
    expect(selected).toHaveAttribute('aria-selected', 'true')
    expect(inventario).toHaveAttribute('aria-selected', 'false')
  })
})

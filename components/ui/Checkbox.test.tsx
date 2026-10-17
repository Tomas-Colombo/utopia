import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('renders a native checkbox that toggles and reports the change', async () => {
    const onChange = vi.fn()
    render(<Checkbox aria-label="Activo" onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'Activo' })

    await userEvent.setup().click(box)
    expect(box).toBeChecked()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not toggle when disabled', async () => {
    render(<Checkbox aria-label="Activo" disabled />)
    const box = screen.getByRole('checkbox', { name: 'Activo' })

    await userEvent.setup().click(box)
    expect(box).not.toBeChecked()
  })

  it('forwards the ref to the input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox ref={ref} aria-label="Activo" />)
    expect(ref.current).toBe(screen.getByRole('checkbox'))
  })
})

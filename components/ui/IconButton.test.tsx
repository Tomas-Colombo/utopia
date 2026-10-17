import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('is named by aria-label and fires onClick', async () => {
    const onClick = vi.fn()
    render(
      <IconButton aria-label="Quitar línea" onClick={onClick}>
        ✕
      </IconButton>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Quitar línea' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not submit a surrounding form by default', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <IconButton aria-label="Cerrar">×</IconButton>
      </form>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <IconButton aria-label="Cerrar" onClick={onClick} disabled>
        ×
      </IconButton>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

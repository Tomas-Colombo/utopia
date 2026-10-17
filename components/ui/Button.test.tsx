import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button')
  })

  it('keeps an explicit submit type', () => {
    render(<Button type="submit">Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'submit')
  })

  it('renders the bare variant without size padding so the caller owns the look', () => {
    render(
      <Button variant="bare" className="text-xs underline">
        Quitar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Quitar' })
    expect(button).toHaveAttribute('data-variant', 'bare')
    expect(button).toHaveClass('text-xs', 'underline')
    expect(button).not.toHaveClass('px-3')
  })
})

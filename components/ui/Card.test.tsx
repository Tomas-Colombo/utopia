import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders a div with the default padding', () => {
    render(<Card data-testid="card">Contenido</Card>)
    const card = screen.getByTestId('card')
    expect(card.tagName).toBe('DIV')
    expect(card).toHaveClass('rounded-lg', 'border', 'bg-card', 'p-4')
  })

  it('renders as a landmark element and forwards aria attributes', () => {
    render(
      <Card as="section" aria-labelledby="t">
        <h2 id="t">Ganancia</h2>
      </Card>,
    )
    expect(screen.getByRole('region', { name: 'Ganancia' }).tagName).toBe('SECTION')
  })

  it('maps padding to a single utility and appends className', () => {
    render(
      <>
        <Card data-testid="none" padding="none" className="p-6 space-y-4" />
        <Card data-testid="lg" padding="lg" />
      </>,
    )
    const none = screen.getByTestId('none')
    expect(none).toHaveClass('p-6', 'space-y-4')
    expect(none).not.toHaveClass('p-4')
    expect(screen.getByTestId('lg')).toHaveClass('p-5')
  })
})

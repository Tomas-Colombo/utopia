import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders children as the visible label content', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('defaults to the neutral variant when none is provided', () => {
    render(<Badge>Draft</Badge>)
    expect(screen.getByText('Draft').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'neutral',
    )
  })

  it.each(['success', 'warning', 'danger', 'neutral', 'info'] as const)(
    'applies data-variant="%s" for the %s variant',
    (variant) => {
      render(<Badge variant={variant}>Label {variant}</Badge>)
      expect(screen.getByText(`Label ${variant}`).closest('[data-variant]')).toHaveAttribute(
        'data-variant',
        variant,
      )
    },
  )

  it('accepts an optional ariaLabel prop applied as aria-label', () => {
    render(
      <Badge variant="success" ariaLabel="Payment status: paid">
        Paid
      </Badge>,
    )
    expect(screen.getByText('Paid').closest('[aria-label]')).toHaveAttribute(
      'aria-label',
      'Payment status: paid',
    )
  })

  it('does not set aria-label when ariaLabel is not provided', () => {
    render(<Badge variant="neutral">Draft</Badge>)
    expect(screen.getByText('Draft').closest('[data-variant]')).not.toHaveAttribute('aria-label')
  })

  it.each(['danger', 'warning', 'success'] as const)(
    'never conveys the %s semantic by color alone — includes a sr-only text prefix',
    (variant) => {
      render(<Badge variant={variant}>Some label</Badge>)
      const prefix = screen.getByText(new RegExp(`^${variant}:`, 'i'))
      expect(prefix).toHaveClass('sr-only')
    },
  )

  it.each(['neutral', 'info'] as const)(
    'does not add a semantic sr-only prefix for the %s variant (no meaning beyond the label)',
    (variant) => {
      render(<Badge variant={variant}>Some label</Badge>)
      expect(screen.queryByText(/^(danger|warning|success):/i)).not.toBeInTheDocument()
    },
  )
})

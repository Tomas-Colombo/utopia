import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(
      <EmptyState
        title="No products yet"
        description="Add your first product to get started."
        cta={{ label: 'Add product', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByText('No products yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first product to get started.')).toBeInTheDocument()
  })

  it('invokes cta.onClick when the CTA button is clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<EmptyState title="No results" cta={{ label: 'Clear filters', onClick }} />)

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the optional icon slot when provided', () => {
    render(
      <EmptyState
        title="No results"
        cta={{ label: 'Reset', onClick: vi.fn() }}
        icon={<span data-testid="empty-icon">📦</span>}
      />,
    )
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })

  it('renders inside a container with role="status" so screen readers announce the empty state', () => {
    render(<EmptyState title="No results" cta={{ label: 'Reset', onClick: vi.fn() }} />)
    expect(screen.getByRole('status')).toHaveTextContent('No results')
  })

  it('warns and renders nothing when cta is missing at runtime (defensive check for non-TS callers, REQ-DS-12)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Simulates a plain-JS caller bypassing the TypeScript required prop.
    const props = { title: 'No results' } as unknown as Parameters<typeof EmptyState>[0]

    const { container } = render(<EmptyState {...props} />)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('EmptyState requires a cta prop'),
    )
    expect(container).toBeEmptyDOMElement()
    warnSpy.mockRestore()
  })
})

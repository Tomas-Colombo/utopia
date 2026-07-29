import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from './Skeleton'

function mockMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

afterEach(() => {
  // @ts-expect-error -- test-only cleanup of the mocked global
  delete window.matchMedia
})

describe('Skeleton', () => {
  it('renders a div with inline style width/height when width/height are provided', () => {
    mockMatchMedia(false)
    render(<Skeleton width={120} height="1rem" data-testid="skeleton" />)
    const el = screen.getByTestId('skeleton')
    expect(el.tagName).toBe('DIV')
    expect(el).toHaveStyle({ width: '120px', height: '1rem' })
  })

  it('has aria-busy="true" and aria-hidden="false" so assistive tech announces the loading state', () => {
    mockMatchMedia(false)
    render(<Skeleton data-testid="skeleton" />)
    const el = screen.getByTestId('skeleton')
    expect(el).toHaveAttribute('aria-busy', 'true')
    expect(el).toHaveAttribute('aria-hidden', 'false')
  })

  it('applies the pulse animation class when the user has no reduced-motion preference', () => {
    mockMatchMedia(false)
    render(<Skeleton data-testid="skeleton" />)
    expect(screen.getByTestId('skeleton')).toHaveClass('animate-pulse')
  })

  it('omits the pulse animation class when prefers-reduced-motion: reduce matches', () => {
    mockMatchMedia(true)
    render(<Skeleton data-testid="skeleton" />)
    expect(screen.getByTestId('skeleton')).not.toHaveClass('animate-pulse')
  })

  it('accepts an optional className for consumer overrides', () => {
    mockMatchMedia(false)
    render(<Skeleton data-testid="skeleton" className="custom-class" />)
    expect(screen.getByTestId('skeleton')).toHaveClass('custom-class')
  })

  it('exposes role="status" so consumers (e.g. Table loading rows) can query it via ARIA', () => {
    mockMatchMedia(false)
    render(<Skeleton />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

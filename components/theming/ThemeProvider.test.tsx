import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeProvider'

function ThemeConsumer() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>toggle</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>,
  )
}

function stubMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark && query === '(prefers-color-scheme: dark)',
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

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('opens dark on a first visit, with nothing stored', async () => {
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('still opens dark when the OS asks for light', async () => {
    // The product decision is that Utopía opens dark for everyone; the old
    // `prefers-color-scheme` fallback is intentionally gone.
    stubMatchMedia(false)
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it("honours a stored 'light' choice over the dark default", async () => {
    window.localStorage.setItem('utopia-theme', 'light')
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('falls back to dark when the stored value is not a theme', async () => {
    window.localStorage.setItem('utopia-theme', 'chartreuse')
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))
  })

  it('persists the choice through setTheme so it survives the next visit', async () => {
    const user = userEvent.setup()
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem('utopia-theme')).toBe('light')
  })

  it('picks up a change made in another tab', async () => {
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))

    // A different tab writes the key; the browser notifies this one.
    window.localStorage.setItem('utopia-theme', 'light')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'utopia-theme' }))
    })

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reads localStorage['utopia-theme'] when present", async () => {
    window.localStorage.setItem('utopia-theme', 'dark')
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('falls back to prefers-color-scheme when no theme is stored', async () => {
    stubMatchMedia(true)
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('falls back to light when neither storage nor OS preference is dark', async () => {
    stubMatchMedia(false)
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('exposes useTheme() returning { theme, setTheme } that mutates the DOM attribute', async () => {
    stubMatchMedia(false)
    const user = userEvent.setup()
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'))

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

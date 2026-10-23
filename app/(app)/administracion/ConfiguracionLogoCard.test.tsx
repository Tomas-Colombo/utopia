import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfiguracionLogoCard } from './ConfiguracionLogoCard'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

describe('ConfiguracionLogoCard', () => {
  it('muestra mensaje cuando no hay logo cargado', () => {
    render(<ConfiguracionLogoCard logoActual={null} canEdit={true} />)
    expect(screen.getByText(/Sin logo cargado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Seleccionar imagen/i })).toBeInTheDocument()
  })

  it('muestra la imagen cuando hay logo actual', () => {
    render(<ConfiguracionLogoCard logoActual="https://example.com/logo.png" canEdit={true} />)
    const img = screen.getByRole('img', { name: /Logo del negocio/i })
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png')
    expect(screen.getByRole('button', { name: /Quitar logo/i })).toBeInTheDocument()
  })

  it('no muestra botones de acción si no tiene permiso de edición', () => {
    render(<ConfiguracionLogoCard logoActual={null} canEdit={false} />)
    expect(screen.queryByRole('button', { name: /Seleccionar imagen/i })).not.toBeInTheDocument()
  })
})

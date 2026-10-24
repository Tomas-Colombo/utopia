import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CambiarPasswordCard } from './CambiarPasswordCard'

const mockToast = { success: vi.fn(), error: vi.fn() }
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}))

describe('CambiarPasswordCard', () => {
  it('renderiza los campos de contraseña y el botón submit', () => {
    render(<CambiarPasswordCard />)
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Actualizar contraseña/i })).toBeDisabled()
  })

  it('habilita el botón cuando los tres campos tienen contenido', () => {
    render(<CambiarPasswordCard />)
    const btn = screen.getByRole('button', { name: /Actualizar contraseña/i })

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual123' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'nueva1234' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'nueva1234' } })

    expect(btn).not.toBeDisabled()
  })
})

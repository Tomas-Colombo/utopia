import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CuotasProgress, ReservaMark, StatusDot } from './StatusMark'

afterEach(cleanup)

describe('StatusMark', () => {
  it('StatusDot always renders its text next to the dot', () => {
    const { container } = render(<StatusDot tone="alerta">Anulada</StatusDot>)
    expect(screen.getByText('Anulada')).toBeInTheDocument()
    expect(container.querySelector('[data-status-dot="alerta"]')).toHaveClass('bg-alerta')
  })

  it('ReservaMark shows the label and the due date in mono warn-ink', () => {
    const { container } = render(<ReservaMark vence="14/10/2026" />)
    expect(screen.getByText('Reserva')).toBeInTheDocument()
    const fecha = screen.getByText('14/10/2026')
    expect(fecha).toHaveClass('font-mono')
    expect(fecha.closest('span.font-mono')).toHaveClass('text-warn-ink')
    expect(container.querySelector('[data-status-ring]')).toHaveClass('border-warn')
  })

  it('CuotasProgress fills one segment per paid instalment and prints "1/3"', () => {
    const { container } = render(<CuotasProgress pagadas={1} total={3} />)
    const segmentos = Array.from(container.querySelectorAll('[data-segment]'))
    expect(segmentos.map((s) => s.getAttribute('data-segment'))).toEqual(['llena', 'vacia', 'vacia'])
    expect(segmentos[0]).toHaveClass('bg-ink', 'w-3', 'h-[5px]')
    expect(segmentos[1]).toHaveClass('bg-line-2')
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('CuotasProgress clamps paid instalments to the total', () => {
    const { container } = render(<CuotasProgress pagadas={9} total={2} />)
    expect(container.querySelectorAll('[data-segment="llena"]')).toHaveLength(2)
  })
})

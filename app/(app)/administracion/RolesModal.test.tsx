import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RolesModal } from './RolesModal'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

it('RolesModal renderiza el módulo revendedoras', () => {
  render(
    <ToastProvider>
      <RolesModal roles={[{ id_rol: '1', nombre: 'Admin', permisos: { revendedoras: ['ver'] }, id_tenant: 't', created_at: '', updated_at: '' }]} />
    </ToastProvider>
  )
  
  const button = screen.getByRole('button', { name: /Roles/ })
  button.click()

  expect(screen.getByText('Revendedoras')).toBeDefined()
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { crearRevendedoraAction, editarRevendedoraAction, bajaRevendedoraAction } from './actions'
import * as dal from '@/lib/dal/revendedoras'
import * as guard from '@/lib/dal/guard'
import * as sessionModule from '@/lib/dal/session'
import { revalidatePath } from 'next/cache'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/dal/session', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/dal/guard', () => ({
  requireModuleRole: vi.fn(),
  classifyAuthError: vi.fn(),
}))

vi.mock('@/lib/dal/revendedoras', () => ({
  crearRevendedora: vi.fn(),
  editarRevendedora: vi.fn(),
  bajaRevendedora: vi.fn(),
}))

describe('revendedoras actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sessionModule.verifySession).mockResolvedValue({} as unknown as sessionModule.Session)
  })

  describe('crearRevendedoraAction', () => {
    it('pasa por las 3 puertas: requireModuleRole -> safeParse -> DAL', async () => {
      vi.mocked(dal.crearRevendedora).mockResolvedValue({ ok: true, data: 'uuid-1' })
      
      const payload = { nombre: 'A', apellido: 'B' }
      const res = await crearRevendedoraAction(payload)
      
      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'crear')
      expect(dal.crearRevendedora).toHaveBeenCalledWith(payload)
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith('/revendedoras')
    })

    it('falla con payload-invalido si Zod rechaza', async () => {
      const payload = { nombre: 123 } // invǭlido
      const res = await crearRevendedoraAction(payload)
      
      expect(guard.requireModuleRole).toHaveBeenCalled()
      expect(dal.crearRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('editarRevendedoraAction', () => {
    it('pasa por las 3 puertas', async () => {
      vi.mocked(dal.editarRevendedora).mockResolvedValue({ ok: true })
      
      const id = '123e4567-e89b-12d3-a456-426614174000'
      const payload = { nombre: 'A', apellido: 'B' }
      const res = await editarRevendedoraAction(id, payload)
      
      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.editarRevendedora).toHaveBeenCalledWith(id, payload)
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith('/revendedoras')
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${id}`)
    })

    it('falla si el id no es UUID', async () => {
      const res = await editarRevendedoraAction('no-uuid', { nombre: 'A', apellido: 'B' })
      expect(dal.editarRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('bajaRevendedoraAction', () => {
    it('pasa por las 3 puertas', async () => {
      vi.mocked(dal.bajaRevendedora).mockResolvedValue({ ok: true })
      
      const id = '123e4567-e89b-12d3-a456-426614174000'
      const res = await bajaRevendedoraAction(id)
      
      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'eliminar')
      expect(dal.bajaRevendedora).toHaveBeenCalledWith(id)
      expect(res.ok).toBe(true)
    })

    it('falla si el id no es UUID', async () => {
      const res = await bajaRevendedoraAction('no-uuid')
      expect(dal.bajaRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  crearReglaGeneralAction,
  guardarComisionPropiaAction,
  terminarReglaAction,
} from './actions'
import * as dal from '@/lib/dal/revendedoras/comisiones'
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
}))

vi.mock('@/lib/dal/revendedoras/comisiones', () => ({
  crearReglaGeneral: vi.fn(),
  guardarComisionPropia: vi.fn(),
  terminarRegla: vi.fn(),
}))

describe('Server Actions: Motor de comisiones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sessionModule.verifySession).mockResolvedValue({} as unknown as sessionModule.Session)
  })

  describe('crearReglaGeneralAction', () => {
    it('pasa por las 3 puertas: requireModuleRole -> safeParse -> DAL', async () => {
      vi.mocked(dal.crearReglaGeneral).mockResolvedValue({ ok: true, id_regla: 'regla-123' })

      const payload = {
        ambito: 'revendedora',
        nombre: 'Escala 2026',
        vigente_desde: '2026-01-01',
        vigente_hasta: null,
        escalas: [
          { objetivo_desde: 0, porcentaje: 10 },
          { objetivo_desde: 50000, porcentaje: 15 },
        ],
      }

      const res = await crearReglaGeneralAction(payload)

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.crearReglaGeneral).toHaveBeenCalledWith(payload)
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith('/revendedoras/comisiones')
    })

    it('falla con payload-invalido si Zod rechaza', async () => {
      const payload = {
        ambito: 'invalido',
        nombre: '',
      }

      const res = await crearReglaGeneralAction(payload)

      expect(guard.requireModuleRole).toHaveBeenCalled()
      expect(dal.crearReglaGeneral).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('guardarComisionPropiaAction', () => {
    it('pasa por las 3 puertas para porcentaje fijo', async () => {
      vi.mocked(dal.guardarComisionPropia).mockResolvedValue({ ok: true, id_regla: 'regla-456' })

      const payload = {
        id_revendedora: '123e4567-e89b-12d3-a456-426614174000',
        tipo: 'fijo',
        porcentajeFijo: 14,
        vigente_desde: '2026-01-01',
      }

      const res = await guardarComisionPropiaAction(payload)

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.guardarComisionPropia).toHaveBeenCalled()
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${payload.id_revendedora}`)
    })

    it('rechaza si faltan campos obligatorios', async () => {
      const payload = { id_revendedora: 'invalido' }
      const res = await guardarComisionPropiaAction(payload)

      expect(guard.requireModuleRole).toHaveBeenCalled()
      expect(dal.guardarComisionPropia).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('terminarReglaAction', () => {
    it('pasa por las 3 puertas y revalida', async () => {
      vi.mocked(dal.terminarRegla).mockResolvedValue({ ok: true })

      const payload = {
        id_regla: '123e4567-e89b-12d3-a456-426614174000',
        vigente_hasta: '2026-06-30',
      }

      const res = await terminarReglaAction(payload)

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.terminarRegla).toHaveBeenCalledWith(payload)
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith('/revendedoras/comisiones')
    })
  })
})

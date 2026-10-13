import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  crearConsignacionRevendedoraAction,
  editarConsignacionRevendedoraAction,
  confirmarConsignacionRevendedoraAction,
  registrarDevolucionRevendedoraAction,
  cerrarConsignacionRevendedoraAction,
  eliminarConsignacionRevendedoraAction,
} from './actions'
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
  crearConsignacionRevendedora: vi.fn(),
  editarConsignacionRevendedora: vi.fn(),
  confirmarConsignacionRevendedora: vi.fn(),
  registrarDevolucionRevendedora: vi.fn(),
  cerrarConsignacionRevendedora: vi.fn(),
  eliminarConsignacionRevendedora: vi.fn(),
}))

const revendedoraId = '123e4567-e89b-12d3-a456-426614174000'
const consignacionId = '223e4567-e89b-12d3-a456-426614174000'
const itemId = '323e4567-e89b-12d3-a456-426614174000'

describe('consignaciones revendedoras actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sessionModule.verifySession).mockResolvedValue({} as unknown as sessionModule.Session)
  })

  describe('crearConsignacionRevendedoraAction', () => {
    it('pasa por las 3 puertas: requireModuleRole(crear) -> safeParse -> DAL', async () => {
      vi.mocked(dal.crearConsignacionRevendedora).mockResolvedValue({
        ok: true,
        id_consignacion_revendedora: consignacionId,
      })

      const payload = {
        id_revendedora: revendedoraId,
        items: [itemId],
        periodo_desde: '2026-10-01',
        periodo_hasta: '2026-10-31',
        observaciones: 'Lote inicial',
      }

      const res = await crearConsignacionRevendedoraAction(payload)

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'crear')
      expect(dal.crearConsignacionRevendedora).toHaveBeenCalledWith(
        expect.objectContaining({
          id_revendedora: revendedoraId,
          items: [itemId],
        })
      )
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${revendedoraId}`)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${revendedoraId}/consignaciones`)
      expect(revalidatePath).toHaveBeenCalledWith('/inventario')
    })

    it('falla con payload-invalido si falta id_revendedora o items está vacío', async () => {
      const res = await crearConsignacionRevendedoraAction({
        id_revendedora: revendedoraId,
        items: [],
      })

      expect(guard.requireModuleRole).toHaveBeenCalled()
      expect(dal.crearConsignacionRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('editarConsignacionRevendedoraAction', () => {
    it('exige revendedoras/editar y llama a editar en DAL', async () => {
      vi.mocked(dal.editarConsignacionRevendedora).mockResolvedValue({ ok: true })

      const payload = {
        id_consignacion_revendedora: consignacionId,
        observaciones: 'Nueva nota',
        periodo_desde: '2026-10-05',
        periodo_hasta: '2026-10-25',
      }

      const res = await editarConsignacionRevendedoraAction(revendedoraId, payload)

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.editarConsignacionRevendedora).toHaveBeenCalledWith(
        expect.objectContaining({
          id_consignacion_revendedora: consignacionId,
          observaciones: 'Nueva nota',
        })
      )
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${revendedoraId}/consignaciones/${consignacionId}`)
    })

    it('falla con payload-invalido si id_consignacion no es UUID', async () => {
      const res = await editarConsignacionRevendedoraAction(revendedoraId, {
        id_consignacion_revendedora: 'no-uuid',
      })

      expect(dal.editarConsignacionRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('confirmarConsignacionRevendedoraAction', () => {
    it('exige revendedoras/crear y llama a confirmar en DAL', async () => {
      vi.mocked(dal.confirmarConsignacionRevendedora).mockResolvedValue({
        ok: true,
        itemsConfirmados: 1,
      })

      const res = await confirmarConsignacionRevendedoraAction(revendedoraId, {
        id_consignacion_revendedora: consignacionId,
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'crear')
      expect(dal.confirmarConsignacionRevendedora).toHaveBeenCalledWith(consignacionId)
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${revendedoraId}/consignaciones/${consignacionId}`)
    })

    it('falla con payload-invalido si el id no es UUID', async () => {
      const res = await confirmarConsignacionRevendedoraAction(revendedoraId, {
        id_consignacion_revendedora: 'no-uuid',
      })

      expect(dal.confirmarConsignacionRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('registrarDevolucionRevendedoraAction', () => {
    it('exige revendedoras/editar y llama a registrarDevolucion en DAL', async () => {
      vi.mocked(dal.registrarDevolucionRevendedora).mockResolvedValue({
        ok: true,
        itemsDevueltos: 1,
      })

      const payload = {
        id_consignacion_revendedora: consignacionId,
        items: [itemId],
        estado_destino: 'disponible',
        motivo: 'Devuelto sano',
      }

      const res = await registrarDevolucionRevendedoraAction(revendedoraId, payload)

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.registrarDevolucionRevendedora).toHaveBeenCalledWith(
        expect.objectContaining({
          id_consignacion_revendedora: consignacionId,
          items: [itemId],
          estado_destino: 'disponible',
        })
      )
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${revendedoraId}/consignaciones/${consignacionId}`)
    })

    it('falla con payload-invalido si estado_destino es inválido', async () => {
      const res = await registrarDevolucionRevendedoraAction(revendedoraId, {
        id_consignacion_revendedora: consignacionId,
        items: [itemId],
        estado_destino: 'vendido', // no es destino válido de devolución
      })

      expect(dal.registrarDevolucionRevendedora).not.toHaveBeenCalled()
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
    })
  })

  describe('cerrarConsignacionRevendedoraAction', () => {
    it('exige revendedoras/editar y llama a cerrar en DAL', async () => {
      vi.mocked(dal.cerrarConsignacionRevendedora).mockResolvedValue({ ok: true })

      const res = await cerrarConsignacionRevendedoraAction(revendedoraId, {
        id_consignacion_revendedora: consignacionId,
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'editar')
      expect(dal.cerrarConsignacionRevendedora).toHaveBeenCalledWith(consignacionId)
      expect(res.ok).toBe(true)
    })
  })

  describe('eliminarConsignacionRevendedoraAction', () => {
    it('exige revendedoras/eliminar y llama a eliminar en DAL', async () => {
      vi.mocked(dal.eliminarConsignacionRevendedora).mockResolvedValue({ ok: true })

      const res = await eliminarConsignacionRevendedoraAction(revendedoraId, {
        id_consignacion_revendedora: consignacionId,
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'eliminar')
      expect(dal.eliminarConsignacionRevendedora).toHaveBeenCalledWith(consignacionId)
      expect(res.ok).toBe(true)
    })
  })
})

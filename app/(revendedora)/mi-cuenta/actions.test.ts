import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as dal from '@/lib/dal/revendedoras'
import * as guard from '@/lib/dal/guard'
import * as sessionModule from '@/lib/dal/session'
import { AuthorizationError } from '@/lib/dal/errors'
import { declararVentaAction, retirarDeclaracionAction } from './actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/dal/session', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/dal/guard', async (importOriginal) => {
  const actual = await importOriginal<typeof guard>()
  return {
    ...actual,
    requireModuleRole: vi.fn(),
  }
})

vi.mock('@/lib/dal/revendedoras', () => ({
  declararVentaRevendedora: vi.fn(),
  retirarDeclaracion: vi.fn(),
}))

describe('mi-cuenta actions (portal revendedora)', () => {
  const mockRevendedoraSession = {
    user: { id: 'user-rev-1', email: 'revendedora@test.com' },
    tenantId: 'tenant-1',
    rolId: 'rol-revendedora',
    rolNombre: 'Revendedora',
    permisos: { revendedoras: ['ver_propio', 'declarar'] },
    modulosHabilitados: ['revendedoras'],
    subdominioOk: true,
    idRevendedora: 'rev-uuid-123',
  } as sessionModule.Session

  const mockOperadorSession = {
    user: { id: 'user-op-1', email: 'admin@test.com' },
    tenantId: 'tenant-1',
    rolId: 'rol-admin',
    rolNombre: 'Administrador',
    permisos: { revendedoras: ['ver', 'crear', 'editar'] },
    modulosHabilitados: ['revendedoras'],
    subdominioOk: true,
    idRevendedora: null,
  } as sessionModule.Session

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(sessionModule.verifySession).mockResolvedValue(mockRevendedoraSession)
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)
  })

  describe('declararVentaAction', () => {
    it('falla con no-permission si la sesión es de un operador (sin idRevendedora)', async () => {
      vi.mocked(sessionModule.verifySession).mockResolvedValue(mockOperadorSession)

      const res = await declararVentaAction({
        id_item: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(res).toEqual({ ok: false, reason: 'no-permission' })
      expect(dal.declararVentaRevendedora).not.toHaveBeenCalled()
    })

    it('falla con no-permission si el rol no tiene revendedoras/declarar', async () => {
      vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(new AuthorizationError('no-permission'))

      const res = await declararVentaAction({
        id_item: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(res).toEqual({ ok: false, reason: 'no-permission' })
      expect(dal.declararVentaRevendedora).not.toHaveBeenCalled()
    })

    it('falla con module-disabled si el módulo está deshabilitado', async () => {
      vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(new AuthorizationError('module-disabled'))

      const res = await declararVentaAction({
        id_item: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(res).toEqual({ ok: false, reason: 'module-disabled' })
      expect(dal.declararVentaRevendedora).not.toHaveBeenCalled()
    })

    it('falla con payload-invalido si falta id_item o no es uuid', async () => {
      const res = await declararVentaAction({ id_item: 'no-es-uuid' })
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.declararVentaRevendedora).not.toHaveBeenCalled()
    })

    it('falla con payload-invalido si se intenta inyectar id_revendedora o tenantId (strictObject)', async () => {
      const res = await declararVentaAction({
        id_item: '123e4567-e89b-12d3-a456-426614174000',
        id_revendedora: 'rev-otra',
      })
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.declararVentaRevendedora).not.toHaveBeenCalled()
    })

    it('éxito: valida permisos, pasa parsed.data al DAL y retorna data', async () => {
      vi.mocked(dal.declararVentaRevendedora).mockResolvedValue({
        ok: true,
        data: 'dec-uuid-1',
      })

      const res = await declararVentaAction({
        id_item: '123e4567-e89b-12d3-a456-426614174000',
        nota: 'Pago acordado',
      })

      expect(res).toEqual({ ok: true, data: 'dec-uuid-1' })
      expect(guard.requireModuleRole).toHaveBeenCalledWith(mockRevendedoraSession, 'revendedoras', 'declarar')
      expect(dal.declararVentaRevendedora).toHaveBeenCalledWith(mockRevendedoraSession, {
        id_item: '123e4567-e89b-12d3-a456-426614174000',
        nota: 'Pago acordado',
      })
    })

    it('retorna error del DAL cuando el ítem no está en su poder o está duplicado', async () => {
      vi.mocked(dal.declararVentaRevendedora).mockResolvedValue({
        ok: false,
        reason: 'item-no-en-poder',
      })

      const res = await declararVentaAction({
        id_item: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(res).toEqual({ ok: false, reason: 'item-no-en-poder' })
    })
  })

  describe('retirarDeclaracionAction', () => {
    it('falla con no-permission si la sesión es de operador', async () => {
      vi.mocked(sessionModule.verifySession).mockResolvedValue(mockOperadorSession)

      const res = await retirarDeclaracionAction({
        id_declaracion: '123e4567-e89b-12d3-a456-426614174001',
      })

      expect(res).toEqual({ ok: false, reason: 'no-permission' })
      expect(dal.retirarDeclaracion).not.toHaveBeenCalled()
    })

    it('falla con payload-invalido si id_declaracion no es uuid', async () => {
      const res = await retirarDeclaracionAction({ id_declaracion: '123' })
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.retirarDeclaracion).not.toHaveBeenCalled()
    })

    it('falla con payload-invalido si se intentan enviar campos extras', async () => {
      const res = await retirarDeclaracionAction({
        id_declaracion: '123e4567-e89b-12d3-a456-426614174001',
        extra: 'campo',
      })
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.retirarDeclaracion).not.toHaveBeenCalled()
    })

    it('éxito: valida permisos, llama al DAL y retorna ok', async () => {
      vi.mocked(dal.retirarDeclaracion).mockResolvedValue({ ok: true })

      const res = await retirarDeclaracionAction({
        id_declaracion: '123e4567-e89b-12d3-a456-426614174001',
      })

      expect(res).toEqual({ ok: true })
      expect(dal.retirarDeclaracion).toHaveBeenCalledWith(mockRevendedoraSession, {
        id_declaracion: '123e4567-e89b-12d3-a456-426614174001',
      })
    })
  })
})

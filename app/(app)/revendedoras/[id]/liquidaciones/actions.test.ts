import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  previewLiquidacionAction,
  generarLiquidacionAction,
  excluirDetalleLiquidacionAction,
  reincluirDetalleLiquidacionAction,
  marcarLiquidacionPagadaAction,
} from './actions'
import * as dal from '@/lib/dal/revendedoras'
import * as guard from '@/lib/dal/guard'
import * as sessionModule from '@/lib/dal/session'
import { AuthorizationError } from '@/lib/dal/errors'
import { revalidatePath } from 'next/cache'

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
  previewLiquidacion: vi.fn(),
  generarLiquidacion: vi.fn(),
  excluirDetalleLiquidacion: vi.fn(),
  reincluirDetalleLiquidacion: vi.fn(),
  marcarLiquidacionPagada: vi.fn(),
}))

const UUID_REV = '123e4567-e89b-12d3-a456-426614174000'
const UUID_LIQ = '223e4567-e89b-12d3-a456-426614174000'
const UUID_DET = '323e4567-e89b-12d3-a456-426614174000'
const UUID_CTA = '423e4567-e89b-12d3-a456-426614174000'

describe('Liquidaciones revendedora — Server Actions (3 puertas)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sessionModule.verifySession).mockResolvedValue({
      tenantId: 'tenant-1',
      rolId: 'rol-1',
      modulosHabilitados: ['revendedoras'],
      permisos: { revendedoras: ['ver', 'liquidar'] },
    } as unknown as sessionModule.Session)
  })

  describe('previewLiquidacionAction', () => {
    it('falla con no-permission si el usuario no tiene permiso revendedoras/ver', async () => {
      vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(new AuthorizationError('no-permission'))

      const res = await previewLiquidacionAction({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
      })

      expect(res).toEqual({ ok: false, reason: 'no-permission' })
      expect(dal.previewLiquidacion).not.toHaveBeenCalled()
    })

    it('falla con module-disabled si el módulo revendedoras está apagado', async () => {
      vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(new AuthorizationError('module-disabled'))

      const res = await previewLiquidacionAction({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
      })

      expect(res).toEqual({ ok: false, reason: 'module-disabled' })
      expect(dal.previewLiquidacion).not.toHaveBeenCalled()
    })

    it('falla con payload-invalido si las fechas tienen formato incorrecto', async () => {
      const res = await previewLiquidacionAction({
        id_revendedora: UUID_REV,
        desde: 'fecha-mala',
        hasta: '2026-05-31',
      })

      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.previewLiquidacion).not.toHaveBeenCalled()
    })

    it('ejecuta exitosamente llamando al DAL con parsed.data', async () => {
      vi.mocked(dal.previewLiquidacion).mockResolvedValueOnce({
        ok: true,
        data: {
          cantidad_lineas: 2,
          monto_vendido: 100000,
          porcentaje_resuelto: 10,
          monto_comision: 10000,
          monto_a_cobrar: 90000,
          lineas: [],
        },
      })

      const res = await previewLiquidacionAction({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'ver')
      expect(dal.previewLiquidacion).toHaveBeenCalledWith({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
      })
      expect(res.ok).toBe(true)
    })
  })

  describe('generarLiquidacionAction', () => {
    it('exige revendedoras/liquidar en Gate 1', async () => {
      vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(new AuthorizationError('no-permission'))

      const res = await generarLiquidacionAction({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
      })

      expect(res).toEqual({ ok: false, reason: 'no-permission' })
      expect(dal.generarLiquidacion).not.toHaveBeenCalled()
    })

    it('falla con payload-invalido si id_revendedora no es uuid', async () => {
      const res = await generarLiquidacionAction({
        id_revendedora: 'no-es-uuid',
        desde: '2026-05-01',
        hasta: '2026-05-31',
      })

      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.generarLiquidacion).not.toHaveBeenCalled()
    })

    it('llama al DAL y revalida rutas ante éxito', async () => {
      vi.mocked(dal.generarLiquidacion).mockResolvedValueOnce({
        ok: true,
        data: UUID_LIQ,
      })

      const res = await generarLiquidacionAction({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
        observaciones: 'Liq mayo',
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'liquidar')
      expect(dal.generarLiquidacion).toHaveBeenCalledWith({
        id_revendedora: UUID_REV,
        desde: '2026-05-01',
        hasta: '2026-05-31',
        observaciones: 'Liq mayo',
      })
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${UUID_REV}`)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${UUID_REV}/liquidaciones`)
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${UUID_REV}/cuenta`)
    })
  })

  describe('excluirDetalleLiquidacionAction y reincluirDetalleLiquidacionAction', () => {
    it('excluir exige liquidar y valida UUID', async () => {
      vi.mocked(dal.excluirDetalleLiquidacion).mockResolvedValueOnce({ ok: true })

      const res = await excluirDetalleLiquidacionAction({
        id_detalle: UUID_DET,
        motivo: 'Falta revisar',
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'liquidar')
      expect(dal.excluirDetalleLiquidacion).toHaveBeenCalledWith({
        id_detalle: UUID_DET,
        motivo: 'Falta revisar',
      })
      expect(res.ok).toBe(true)
    })

    it('reincluir rechaza payload sin id_detalle', async () => {
      const res = await reincluirDetalleLiquidacionAction({})
      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.reincluirDetalleLiquidacion).not.toHaveBeenCalled()
    })

    it('reincluir llama al DAL cuando es válido', async () => {
      vi.mocked(dal.reincluirDetalleLiquidacion).mockResolvedValueOnce({ ok: true })

      const res = await reincluirDetalleLiquidacionAction({ id_detalle: UUID_DET })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'liquidar')
      expect(dal.reincluirDetalleLiquidacion).toHaveBeenCalledWith({ id_detalle: UUID_DET })
      expect(res.ok).toBe(true)
    })
  })

  describe('marcarLiquidacionPagadaAction', () => {
    it('exige revendedoras/liquidar en Gate 1', async () => {
      vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(new AuthorizationError('no-permission'))

      const res = await marcarLiquidacionPagadaAction({
        id_liquidacion: UUID_LIQ,
        id_cuenta: UUID_CTA,
        monto: 90000,
      })

      expect(res).toEqual({ ok: false, reason: 'no-permission' })
      expect(dal.marcarLiquidacionPagada).not.toHaveBeenCalled()
    })

    it('rechaza monto menor o igual a cero con payload-invalido', async () => {
      const res = await marcarLiquidacionPagadaAction({
        id_liquidacion: UUID_LIQ,
        id_cuenta: UUID_CTA,
        monto: 0,
      })

      expect(res).toEqual({ ok: false, reason: 'payload-invalido' })
      expect(dal.marcarLiquidacionPagada).not.toHaveBeenCalled()
    })

    it('llama al DAL y revalida rutas ante éxito', async () => {
      vi.mocked(dal.marcarLiquidacionPagada).mockResolvedValueOnce({ ok: true })

      const res = await marcarLiquidacionPagadaAction({
        id_liquidacion: UUID_LIQ,
        id_cuenta: UUID_CTA,
        monto: 90000,
        metodo: 'transferencia',
        referencia: 'TR-1234',
        fecha: '2026-06-01',
      })

      expect(guard.requireModuleRole).toHaveBeenCalledWith(expect.anything(), 'revendedoras', 'liquidar')
      expect(dal.marcarLiquidacionPagada).toHaveBeenCalledWith({
        id_liquidacion: UUID_LIQ,
        id_cuenta: UUID_CTA,
        monto: 90000,
        metodo: 'transferencia',
        referencia: 'TR-1234',
        fecha: '2026-06-01',
      })
      expect(res.ok).toBe(true)
      expect(revalidatePath).toHaveBeenCalledWith('/revendedoras')
      expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${UUID_LIQ}`)
      expect(revalidatePath).toHaveBeenCalledWith('/precios/cuentas')
    })
  })
})

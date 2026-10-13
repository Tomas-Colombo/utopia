import { describe, expect, it, vi, beforeEach } from 'vitest'
import { registrarVentaAction } from './actions'
import * as dalVentas from '@/lib/dal/ventas/venta'
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

vi.mock('@/lib/dal/guard', () => ({
  requireModuleRole: vi.fn(),
}))

vi.mock('@/lib/dal/ventas/venta', () => ({
  spRegistrarVenta: vi.fn(),
  spAnularVenta: vi.fn(),
  spRegistrarDevolucionCliente: vi.fn(),
}))

const UUID_ITEM = '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const UUID_REV = '8a7b6c5d-4e3f-4a1b-8c9d-8e7f6a5b4c3d'

describe('registrarVentaAction — 3 gates and permission matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sessionModule.verifySession).mockResolvedValue({
      tenantId: 'tenant-123',
      user: { id: 'user-456' },
    } as unknown as sessionModule.Session)
  })

  // ── Gate 1: Autorización Ventas ──────────────────────────────────────────
  it('falla en Gate 1 si no tiene permiso ventas:crear', async () => {
    vi.mocked(guard.requireModuleRole).mockRejectedValueOnce(
      new AuthorizationError('no-permission'),
    )

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
    })

    expect(guard.requireModuleRole).toHaveBeenCalledWith(
      expect.anything(),
      'ventas',
      'crear',
    )
    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: false, reason: 'no-permission' })
  })

  // ── Gate 2: Validación Zod ──────────────────────────────────────────────
  it('falla en Gate 2 con lineas-vacias si la lista de ítems está vacía', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)

    const res = await registrarVentaAction({
      lineas: [],
      formaPago: 'efectivo',
    })

    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toMatch(/^lineas-vacias/)
    }
  })

  it('falla en Gate 2 con canal-invalido si canal es online', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      canal: 'online' as unknown as 'local',
    })

    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toMatch(/^canal-invalido/)
    }
  })

  it('falla en Gate 2 con campo-desconocido si envían claves extra (strictObject)', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      claveInesperada: 'ataque',
    })

    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: false, reason: 'campo-desconocido' })
  })

  it('falla si canal revendedora no incluye idRevendedora', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      canal: 'revendedora',
    })

    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: false, reason: 'revendedora-invalida' })
  })

  it('falla si hay financiación sin cliente', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      financiacion: { cuotas: 3, primer_vencimiento: '2026-11-01' },
    })

    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: false, reason: 'financiacion-sin-cliente' })
  })

  // ── Matriz de autorización para canal Revendedora ───────────────────────
  it('devuelve module-disabled si el módulo revendedoras está deshabilitado en canal revendedora', async () => {
    vi.mocked(guard.requireModuleRole).mockImplementation(
      async (_session, modulo) => {
        if (modulo === 'ventas') return
        if (modulo === 'revendedoras') {
          throw new AuthorizationError('module-disabled')
        }
      },
    )

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      canal: 'revendedora',
      idRevendedora: UUID_REV,
    })

    expect(guard.requireModuleRole).toHaveBeenCalledWith(
      expect.anything(),
      'ventas',
      'crear',
    )
    expect(guard.requireModuleRole).toHaveBeenCalledWith(
      expect.anything(),
      'revendedoras',
      'crear',
    )
    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: false, reason: 'module-disabled' })
  })

  it('devuelve no-permission si no tiene rol revendedoras:crear en canal revendedora', async () => {
    vi.mocked(guard.requireModuleRole).mockImplementation(
      async (_session, modulo) => {
        if (modulo === 'ventas') return
        if (modulo === 'revendedoras') {
          throw new AuthorizationError('no-permission')
        }
      },
    )

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      canal: 'revendedora',
      idRevendedora: UUID_REV,
    })

    expect(guard.requireModuleRole).toHaveBeenCalledWith(
      expect.anything(),
      'revendedoras',
      'crear',
    )
    expect(dalVentas.spRegistrarVenta).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: false, reason: 'no-permission' })
  })

  // ── Gate 3: Llamada a DAL ───────────────────────────────────────────────
  it('registra venta local válida llamando al DAL y revalidando rutas', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)
    vi.mocked(dalVentas.spRegistrarVenta).mockResolvedValue('venta-uuid-123')

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
    })

    expect(dalVentas.spRegistrarVenta).toHaveBeenCalledWith({
      lineas: [{ id_item: UUID_ITEM }],
      forma_pago: 'efectivo',
      id_cliente: null,
      id_reserva: null,
      observaciones: null,
      pagos: undefined,
      financiacion: null,
      financiador: null,
      canal: 'local',
      id_revendedora: null,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/ventas')
    expect(revalidatePath).toHaveBeenCalledWith('/inventario/productos')
    expect(revalidatePath).toHaveBeenCalledWith('/inventario')
    expect(res).toEqual({ ok: true, data: { id: 'venta-uuid-123' } })
  })

  it('registra venta revendedora autorizada pasando id_revendedora y canal', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)
    vi.mocked(dalVentas.spRegistrarVenta).mockResolvedValue('venta-rev-uuid')

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      canal: 'revendedora',
      idRevendedora: UUID_REV,
    })

    expect(guard.requireModuleRole).toHaveBeenCalledWith(
      expect.anything(),
      'revendedoras',
      'crear',
    )
    expect(dalVentas.spRegistrarVenta).toHaveBeenCalledWith(
      expect.objectContaining({
        canal: 'revendedora',
        id_revendedora: UUID_REV,
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/revendedoras')
    expect(revalidatePath).toHaveBeenCalledWith(`/revendedoras/${UUID_REV}`)
    expect(res).toEqual({ ok: true, data: { id: 'venta-rev-uuid' } })
  })

  it('propaga error del DAL como reason', async () => {
    vi.mocked(guard.requireModuleRole).mockResolvedValue(undefined)
    vi.mocked(dalVentas.spRegistrarVenta).mockRejectedValue(
      new Error('item-no-en-revendedora'),
    )

    const res = await registrarVentaAction({
      lineas: [{ id_item: UUID_ITEM }],
      formaPago: 'efectivo',
      canal: 'revendedora',
      idRevendedora: UUID_REV,
    })

    expect(res).toEqual({ ok: false, reason: 'item-no-en-revendedora' })
  })
})

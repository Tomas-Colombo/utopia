import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  verifySessionMock,
  requireModuleRoleMock,
  contarDisponiblesMultiplesProductosMock,
} = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  requireModuleRoleMock: vi.fn(),
  contarDisponiblesMultiplesProductosMock: vi.fn(),
}))

vi.mock('@/lib/dal/session', () => ({
  verifySession: verifySessionMock,
}))

vi.mock('@/lib/dal/guard', () => ({
  requireModuleRole: requireModuleRoleMock,
}))

vi.mock('@/lib/dal/inventario/item', () => ({
  contarDisponiblesMultiplesProductos: contarDisponiblesMultiplesProductosMock,
}))

describe('GET /api/ventas/stock-disponible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifySessionMock.mockResolvedValue({ tenantId: 't-1', idRevendedora: null })
    requireModuleRoleMock.mockResolvedValue(undefined)
  })

  it('valida UUIDs, deduplica y delega al DAL en una sola llamada', async () => {
    const p1 = 'a0000000-0000-0000-0000-000000000001'
    const p2 = 'a0000000-0000-0000-0000-000000000002'

    contarDisponiblesMultiplesProductosMock.mockResolvedValue([
      { id_producto: p1, talle: 'M', disponibles: 3 },
      { id_producto: p2, talle: null, disponibles: 5 },
    ])

    const { GET } = await import('./route')
    const req = new NextRequest(
      `http://localhost:3000/api/ventas/stock-disponible?productos=${p1},${p1},invalid-id,${p2}&id_reserva=res-123`,
    )

    const res = await GET(req)
    const json = await res.json()

    expect(contarDisponiblesMultiplesProductosMock).toHaveBeenCalledTimes(1)
    expect(contarDisponiblesMultiplesProductosMock).toHaveBeenCalledWith(
      [p1, p2],
      { idReservaCtx: 'res-123' },
    )
    expect(json).toEqual({
      ok: true,
      stock: [
        { id_producto: p1, talle: 'M', disponibles: 3 },
        { id_producto: p2, talle: null, disponibles: 5 },
      ],
    })
  })
})

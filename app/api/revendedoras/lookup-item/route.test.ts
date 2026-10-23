import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  verifySessionMock,
  requireModuleRoleMock,
  lookupItemParaConsignacionRevendedoraMock,
  lookupItemParaVentaRevendedoraMock,
} = vi.hoisted(() => ({
  verifySessionMock: vi.fn(),
  requireModuleRoleMock: vi.fn(),
  lookupItemParaConsignacionRevendedoraMock: vi.fn(),
  lookupItemParaVentaRevendedoraMock: vi.fn(),
}))

vi.mock('@/lib/dal/session', () => ({
  verifySession: verifySessionMock,
}))

vi.mock('@/lib/dal/guard', () => ({
  requireModuleRole: requireModuleRoleMock,
}))

vi.mock('@/lib/dal/revendedoras', () => ({
  lookupItemParaConsignacionRevendedora: lookupItemParaConsignacionRevendedoraMock,
  lookupItemParaVentaRevendedora: lookupItemParaVentaRevendedoraMock,
}))

describe('GET /api/revendedoras/lookup-item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifySessionMock.mockResolvedValue({ tenantId: 't-1', idRevendedora: null })
    requireModuleRoleMock.mockResolvedValue(undefined)
  })

  it('pasa la lista excluir y opciones a lookupItemParaConsignacionRevendedora en modo consignacion', async () => {
    lookupItemParaConsignacionRevendedoraMock.mockResolvedValue({
      ok: true,
      data: {
        id_item: 'item-2',
        id_producto: 'prod-1',
        nombre_producto: 'Remera',
        codigo_barra: 'UTP-002',
        sku: 'REM-0001',
        talle: 'M',
        precio_actual: 12000,
      },
    })

    const { GET } = await import('./route')
    const req = new NextRequest(
      'http://localhost:3000/api/revendedoras/lookup-item?qr=REM-0001&id_revendedora=rev-1&excluir=item-1,item-9',
    )
    const res = await GET(req)
    const body = await res.json()

    expect(lookupItemParaConsignacionRevendedoraMock).toHaveBeenCalledWith(
      'REM-0001',
      'rev-1',
      ['item-1', 'item-9'],
      { idProducto: undefined, talle: null, sinTalle: false },
    )
    expect(body).toEqual({
      ok: true,
      item: {
        id_item: 'item-2',
        id_producto: 'prod-1',
        nombre_producto: 'Remera',
        codigo_barra: 'UTP-002',
        sku: 'REM-0001',
        talle: 'M',
        precio_actual: 12000,
      },
    })
  })

  it('permite buscar en modo consignacion por id_producto + talle sin code', async () => {
    lookupItemParaConsignacionRevendedoraMock.mockResolvedValue({
      ok: true,
      data: {
        id_item: 'item-3',
        id_producto: 'prod-1',
        nombre_producto: 'Remera',
        codigo_barra: 'UTP-003',
        sku: 'REM-0001',
        talle: 'L',
        precio_actual: 12000,
      },
    })

    const { GET } = await import('./route')
    const req = new NextRequest(
      'http://localhost:3000/api/revendedoras/lookup-item?id_producto=prod-1&talle=L&id_revendedora=rev-1',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(lookupItemParaConsignacionRevendedoraMock).toHaveBeenCalledWith(
      undefined,
      'rev-1',
      [],
      { idProducto: 'prod-1', talle: 'L', sinTalle: false },
    )
  })

  it('pasa talle y sinTalle a lookupItemParaVentaRevendedora en modo venta', async () => {
    lookupItemParaVentaRevendedoraMock.mockResolvedValue({
      ok: false,
      reason: 'elegir-talle',
      id_producto: 'prod-1',
      producto_nombre: 'Remera',
      talles: [{ talle: 'M', disponibles: 1, reservados: 0 }],
      sin_talle: 0,
      sin_talle_reservados: 0,
      id_reserva: null,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(
      'http://localhost:3000/api/revendedoras/lookup-item?code=REM-0001&id_revendedora=rev-1&modo=venta',
    )
    const res = await GET(req)
    const body = await res.json()

    expect(lookupItemParaVentaRevendedoraMock).toHaveBeenCalledWith(
      'REM-0001',
      'rev-1',
      undefined,
      [],
      { talle: null, sinTalle: false },
    )
    expect(body.reason).toBe('elegir-talle')
    expect(body.id_producto).toBe('prod-1')
  })
})

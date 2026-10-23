import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/dal/supabase', () => ({
  createServerClient: createServerClientMock,
}))

describe('listItemsParaEtiquetas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selecciona descripcion, filtra solo estados imprimibles y devuelve las etiquetas en el orden pedido', async () => {
    let selectedCols = ''
    const inCalls: Array<{ col: string; values: unknown[] }> = []

    const builder = {
      select: (cols: string) => {
        selectedCols = cols
        return builder
      },
      in: (col: string, values: unknown[]) => {
        inCalls.push({ col, values })
        return builder
      },
      then: (resolve: (val: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              qr_code: 'QR-002',
              talle: 'M',
              producto: { nombre: 'Remera Básica', sku: 'REM-01', descripcion: 'Color negro, cuello redondo' },
            },
            {
              qr_code: 'QR-001',
              talle: null,
              producto: { nombre: 'Gorra Lisa', sku: null, descripcion: null },
            },
          ],
          error: null,
        }).then(resolve),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    const { listItemsParaEtiquetas } = await import('./item')
    const res = await listItemsParaEtiquetas(['QR-001', 'QR-002'])

    expect(selectedCols).toContain('descripcion')
    expect(inCalls).toEqual([
      { col: 'qr_code', values: ['QR-001', 'QR-002'] },
      { col: 'estado_item', values: ['disponible', 'reservado'] },
    ])
    expect(res).toEqual([
      {
        qr_code: 'QR-001',
        talle: null,
        nombre: 'Gorra Lisa',
        sku: null,
        descripcion: null,
      },
      {
        qr_code: 'QR-002',
        talle: 'M',
        nombre: 'Remera Básica',
        sku: 'REM-01',
        descripcion: 'Color negro, cuello redondo',
      },
    ])
  })
})

describe('listQrsByIngreso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consulta los qr_code vigentes (disponible o reservado) del ingreso en una sola query ordenada por creación', async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = []
    const inCalls: Array<{ col: string; values: unknown[] }> = []
    const orderCalls: Array<{ col: string; opts: unknown }> = []

    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push({ col, val })
        return builder
      },
      in: (col: string, values: unknown[]) => {
        inCalls.push({ col, values })
        return builder
      },
      order: (col: string, opts: unknown) => {
        orderCalls.push({ col, opts })
        return builder
      },
      then: (resolve: (val: unknown) => unknown) =>
        Promise.resolve({
          data: [{ qr_code: 'UTP-001' }, { qr_code: 'UTP-002' }],
          error: null,
        }).then(resolve),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    const { listQrsByIngreso } = await import('./item')
    const qrs = await listQrsByIngreso('ing-123')

    expect(eqCalls).toEqual([{ col: 'id_ingreso', val: 'ing-123' }])
    expect(inCalls).toEqual([{ col: 'estado_item', values: ['disponible', 'reservado'] }])
    expect(orderCalls).toEqual([
      { col: 'created_at', opts: { ascending: true } },
      { col: 'id_item', opts: { ascending: true } },
    ])
    expect(qrs).toEqual(['UTP-001', 'UTP-002'])
  })
})

describe('listItemsParaEtiquetasPorOrigen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consulta origen producto con paginación determinista y filtro de talle', async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = []
    const inCalls: Array<{ col: string; values: unknown[] }> = []
    let rangeArgs: [number, number] | null = null

    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push({ col, val })
        return builder
      },
      in: (col: string, values: unknown[]) => {
        inCalls.push({ col, values })
        return builder
      },
      order: () => builder,
      range: (desde: number, hasta: number) => {
        rangeArgs = [desde, hasta]
        return builder
      },
      then: (resolve: (val: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              qr_code: 'UTP-PR-1',
              talle: 'L',
              producto: { nombre: 'Buzo Friza', sku: 'BUZ-1', descripcion: 'Negro' },
            },
          ],
          count: 250,
          error: null,
        }).then(resolve),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    const { listItemsParaEtiquetasPorOrigen } = await import('./item')
    const res = await listItemsParaEtiquetasPorOrigen({
      tipo: 'producto',
      idProducto: 'prod-456',
      talle: 'L',
      incluirReservados: false,
      tanda: 2,
    })

    expect(eqCalls).toEqual([
      { col: 'id_producto', val: 'prod-456' },
      { col: 'talle', val: 'L' },
    ])
    expect(inCalls).toEqual([{ col: 'estado_item', values: ['disponible'] }])
    expect(rangeArgs).toEqual([200, 399])
    expect(res.total).toBe(250)
    expect(res.items).toHaveLength(1)
    expect(res.items[0].qr_code).toBe('UTP-PR-1')
  })
})

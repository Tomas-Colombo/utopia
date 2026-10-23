import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerClientMock, getReservasActivasDeItemsMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getReservasActivasDeItemsMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/dal/supabase', () => ({
  createServerClient: createServerClientMock,
}))
vi.mock('@/lib/dal/reservas/reserva', () => ({
  getReservasActivasDeItems: getReservasActivasDeItemsMock,
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

describe('contarDisponiblesMultiplesProductos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve array vacio si la lista de ids está vacia sin consultar al server', async () => {
    const { contarDisponiblesMultiplesProductos } = await import('./item')
    const res = await contarDisponiblesMultiplesProductos([])
    expect(res).toEqual([])
    expect(createServerClientMock).not.toHaveBeenCalled()
  })

  it('agrupa por producto y talle y descuenta reservas ajenas al contexto', async () => {
    const items = [
      { id_item: 'it-1', id_producto: 'p-1', talle: 'M' },
      { id_item: 'it-2', id_producto: 'p-1', talle: 'M' },
      { id_item: 'it-3', id_producto: 'p-1', talle: 'L' },
      { id_item: 'it-4', id_producto: 'p-2', talle: null },
      { id_item: 'it-5', id_producto: 'p-2', talle: null },
    ]

    const builder = {
      select: () => builder,
      in: () => builder,
      eq: () => builder,
      then: (resolve: (val: unknown) => unknown) =>
        Promise.resolve({ data: items, error: null }).then(resolve),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    // it-2 está en una reserva ajena ('res-ajena')
    // it-5 está en la reserva del contexto ('res-ctx')
    getReservasActivasDeItemsMock.mockResolvedValue(
      new Map([
        ['it-2', 'res-ajena'],
        ['it-5', 'res-ctx'],
      ]),
    )

    const { contarDisponiblesMultiplesProductos } = await import('./item')
    const res = await contarDisponiblesMultiplesProductos(['p-1', 'p-2'], {
      idReservaCtx: 'res-ctx',
    })

    // p-1 talle M: 2 items, 1 bloqueado por ajena -> 1 disponible
    // p-1 talle L: 1 item, 0 bloqueado -> 1 disponible
    // p-2 talle null: 2 items, 1 bloqueado por res-ctx (permitido) -> 2 disponibles
    expect(res).toEqual([
      { id_producto: 'p-1', talle: 'M', disponibles: 1 },
      { id_producto: 'p-1', talle: 'L', disponibles: 1 },
      { id_producto: 'p-2', talle: null, disponibles: 2 },
    ])
  })
})

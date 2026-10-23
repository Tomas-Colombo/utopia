import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/dal/supabase', () => ({
  createServerClient: createServerClientMock,
}))

describe('getReservasActivasDeItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve Map vacío sin consultar Supabase si el array de ids está vacío', async () => {
    const { getReservasActivasDeItems } = await import('./reserva')
    const res = await getReservasActivasDeItems([])

    expect(res.size).toBe(0)
    expect(createServerClientMock).not.toHaveBeenCalled()
  })

  it('consulta detalle_reserva en batch con in y eq estado activa y devuelve el Map<id_item, id_reserva>', async () => {
    let selectCols = ''
    const inCalls: Array<{ col: string; values: unknown[] }> = []
    const eqCalls: Array<{ col: string; val: unknown }> = []

    const builder = {
      select: (cols: string) => {
        selectCols = cols
        return builder
      },
      in: (col: string, values: unknown[]) => {
        inCalls.push({ col, values })
        return builder
      },
      eq: (col: string, val: unknown) => {
        eqCalls.push({ col, val })
        return builder
      },
      then: (resolve: (val: unknown) => unknown) =>
        Promise.resolve({
          data: [
            { id_item: 'item-1', id_reserva: 'res-A' },
            { id_item: 'item-3', id_reserva: 'res-B' },
          ],
          error: null,
        }).then(resolve),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    const { getReservasActivasDeItems } = await import('./reserva')
    const res = await getReservasActivasDeItems(['item-1', 'item-2', 'item-3'])

    expect(selectCols).toBe('id_item, id_reserva')
    expect(inCalls).toEqual([{ col: 'id_item', values: ['item-1', 'item-2', 'item-3'] }])
    expect(eqCalls).toEqual([{ col: 'estado', val: 'activa' }])
    expect(res.size).toBe(2)
    expect(res.get('item-1')).toBe('res-A')
    expect(res.get('item-2')).toBeUndefined()
    expect(res.get('item-3')).toBe('res-B')
  })
})

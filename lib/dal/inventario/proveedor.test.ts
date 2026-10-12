import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/dal/supabase', () => ({
  createServerClient: createServerClientMock,
}))

describe('getPerfilProveedorPorId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('incluye en_revendedora dentro de los estados que cuentan como stock en poder de la tienda', async () => {
    const inCalls: Array<{ col: string; values: unknown[] }> = []

    const makeBuilder = (table: string) => {
      let isCountHead = false
      const builder = {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) isCountHead = true
          return builder
        },
        eq: () => builder,
        is: () => builder,
        gt: () => builder,
        in: (col: string, values: unknown[]) => {
          inCalls.push({ col, values })
          return builder
        },
        then: (resolve: (val: unknown) => unknown) => {
          if (table === 'item_producto' && !isCountHead) {
            return Promise.resolve({
              data: [
                { costo_ingreso: 10000 }, // disponible
                { costo_ingreso: 15000 }, // en_revendedora
              ],
              error: null,
            }).then(resolve)
          }
          if (isCountHead) {
            return Promise.resolve({ count: 1, error: null }).then(resolve)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve)
        },
      }
      return builder
    }

    createServerClientMock.mockResolvedValue({
      from: (table: string) => makeBuilder(table),
    })

    const { getPerfilProveedorPorId } = await import('./proveedor')
    const perfil = await getPerfilProveedorPorId('prov-1')

    expect(inCalls).toEqual([
      {
        col: 'estado_item',
        values: ['disponible', 'reservado', 'devuelto_cliente', 'en_revendedora'],
      },
    ])
    expect(perfil.items_en_stock_consignacion).toBe(2)
    expect(perfil.valor_stock_consignacion).toBe(25000)
    expect(perfil.deuda_total_consignacion).toBe(25000)
  })
})

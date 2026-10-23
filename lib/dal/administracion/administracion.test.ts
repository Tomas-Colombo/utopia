import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QR_LADO_MM_DEFAULT } from '@/lib/inventario/limites'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/dal/supabase', () => ({
  createServerClient: createServerClientMock,
  createServiceClient: vi.fn(),
}))

describe('getConfiguracionQrLadoMm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve el valor redondeado cuando está en rango [15, 100]', async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = []
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push({ col, val })
        return builder
      },
      maybeSingle: async () => ({ data: { valor: 48 }, error: null }),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    const { getConfiguracionQrLadoMm } = await import('./administracion')
    const res = await getConfiguracionQrLadoMm()

    expect(eqCalls).toEqual([
      { col: 'seccion', val: 'etiquetas' },
      { col: 'clave', val: 'qr_lado_mm' },
    ])
    expect(res).toBe(48)
  })

  it('devuelve QR_LADO_MM_DEFAULT cuando no existe fila o el valor está fuera de rango', async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: { valor: 5 }, error: null }),
    }

    createServerClientMock.mockResolvedValue({
      from: () => builder,
    })

    const { getConfiguracionQrLadoMm } = await import('./administracion')
    expect(await getConfiguracionQrLadoMm()).toBe(QR_LADO_MM_DEFAULT)
  })
})

describe('spSetConfiguracionQrLadoMm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invoca el RPC sp_set_configuracion_qr_lado_mm con p_lado_mm y p_ip', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: 50, error: null })
    createServerClientMock.mockResolvedValue({
      rpc: rpcMock,
    })

    const { spSetConfiguracionQrLadoMm } = await import('./administracion')
    const res = await spSetConfiguracionQrLadoMm(50)

    expect(rpcMock).toHaveBeenCalledWith('sp_set_configuracion_qr_lado_mm', {
      p_lado_mm: 50,
      p_ip: null,
    })
    expect(res).toBe(50)
  })
})

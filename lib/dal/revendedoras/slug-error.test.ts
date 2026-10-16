import { describe, expect, it } from 'vitest'
import { extractErrorSlug, type ReglaSlug } from './slug-error'

const REGLAS_CONSIGNACION: readonly ReglaSlug[] = [
  { slug: 'item-ya-en-consignacion-revendedora', codigo: '23505', contiene: ['consignacion_revendedora_detalle_item_activo_uk'] },
]

describe('extractErrorSlug', () => {
  it('corta sufijos con id o parámetros después de dos puntos', () => {
    expect(
      extractErrorSlug({
        message: 'item-no-entregable: 11111111-1111-1111-1111-111111111111 (estado=reservado)',
      })
    ).toBe('item-no-entregable')

    expect(
      extractErrorSlug({
        message: 'consignacion-con-items-en-poder: 3',
      })
    ).toBe('consignacion-con-items-en-poder')

    expect(
      extractErrorSlug({
        message: 'item-en-reserva: 22222222-2222-2222-2222-222222222222',
      })
    ).toBe('item-en-reserva')
  })

  it('remueve prefijos de stored procedures de Postgres', () => {
    expect(
      extractErrorSlug({
        message:
          'sp_confirmar_consignacion_revendedora: item-no-entregable: 33333333-3333-3333-3333-333333333333',
      })
    ).toBe('item-no-entregable')

    expect(
      extractErrorSlug({
        message: 'sp_cerrar_consignacion_revendedora: consignacion-con-items-en-poder: 1',
      })
    ).toBe('consignacion-con-items-en-poder')
  })

  it('reconoce el error 23505 del índice de ítem activo en consignación de revendedora', () => {
    expect(
      extractErrorSlug({
        code: '23505',
        message: 'duplicate key value violates unique constraint "consignacion_revendedora_detalle_item_activo_uk"',
      }, REGLAS_CONSIGNACION)
    ).toBe('item-ya-en-consignacion-revendedora')
  })

  it('retorna error-desconocido ante errores inesperados o vacíos', () => {
    expect(extractErrorSlug(null)).toBe('error-desconocido')
    expect(extractErrorSlug(undefined)).toBe('error-desconocido')
    expect(extractErrorSlug({ message: 'Something completely random broke here' })).toBe('error-desconocido')
  })

  it('devuelve la línea completa con detalle para las reglas conDetalle', () => {
    const reglas: ReglaSlug[] = [{ slug: 'precio-no-resoluble', conDetalle: true }]
    expect(
      extractErrorSlug({ message: 'sp_x: precio-no-resoluble: producto 7 (sin-precio-lista)\nCONTEXT: ...' }, reglas),
    ).toBe('precio-no-resoluble: producto 7 (sin-precio-lista)')
  })

  it('acepta guion bajo en el slug genérico solo si se pide', () => {
    expect(extractErrorSlug({ message: 'algo_raro' })).toBe('error-desconocido')
    expect(extractErrorSlug({ message: 'algo_raro' }, [], { guionBajo: true })).toBe('algo_raro')
  })
})

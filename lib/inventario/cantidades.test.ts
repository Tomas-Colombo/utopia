import { describe, expect, it } from 'vitest'
import {
  evaluarCantidadDisponible,
  MAX_CANTIDAD_LOOKUP,
  MAX_PRODUCTOS_STOCK_DISPONIBLE,
  parsearCantidadLookup,
  validarYFiltrarIdsProductos,
} from './cantidades'

describe('parsearCantidadLookup', () => {
  it('devuelve 1 por defecto si es nulo, vacío o inválido', () => {
    expect(parsearCantidadLookup()).toBe(1)
    expect(parsearCantidadLookup(null)).toBe(1)
    expect(parsearCantidadLookup('')).toBe(1)
    expect(parsearCantidadLookup('0')).toBe(1)
    expect(parsearCantidadLookup('-5')).toBe(1)
    expect(parsearCantidadLookup('abc')).toBe(1)
  })

  it('redondea enteros positivos y acota en MAX_CANTIDAD_LOOKUP', () => {
    expect(parsearCantidadLookup('5')).toBe(5)
    expect(parsearCantidadLookup('3.8')).toBe(3)
    expect(parsearCantidadLookup('100')).toBe(MAX_CANTIDAD_LOOKUP)
  })
})

describe('evaluarCantidadDisponible', () => {
  it('entrega la cantidad pedida si hay suficiente stock disponible', () => {
    const res = evaluarCantidadDisponible(3, 5)
    expect(res).toEqual({
      entregadas: 3,
      incompleto: false,
      aviso: undefined,
    })
  })

  it('entrega las unidades que hay y avisa stock-parcial-disponible si hay menos', () => {
    const res = evaluarCantidadDisponible(5, 2)
    expect(res).toEqual({
      entregadas: 2,
      incompleto: true,
      aviso: 'stock-parcial-disponible',
    })
  })

  it('no marca incompleto si hay 0 disponibles', () => {
    const res = evaluarCantidadDisponible(3, 0)
    expect(res).toEqual({
      entregadas: 0,
      incompleto: false,
      aviso: undefined,
    })
  })
})

describe('validarYFiltrarIdsProductos', () => {
  const uuid1 = '11111111-1111-1111-1111-111111111111'
  const uuid2 = '22222222-2222-2222-2222-222222222222'

  it('deduplica y descarta IDs que no son UUID', () => {
    const res = validarYFiltrarIdsProductos([
      uuid1,
      'no-uuid',
      uuid2,
      uuid1,
      '   ',
    ])
    expect(res).toEqual([uuid1, uuid2])
  })

  it('recorta en el tope especificado', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => {
      const hex = i.toString(16).padStart(12, '0')
      return `00000000-0000-0000-0000-${hex}`
    })
    const res = validarYFiltrarIdsProductos(muchos)
    expect(res).toHaveLength(MAX_PRODUCTOS_STOCK_DISPONIBLE)
  })
})

import { describe, expect, it } from 'vitest'
import {
  armarRespuestaElegirTalle,
  decidirLookupPorTalle,
  escaparPatronLike,
  parsearSku,
} from './codigo'

describe('parsearSku', () => {
  it('separa el talle pegado al SKU autogenerado', () => {
    expect(parsearSku('REM-0007-M')).toEqual({ baseSku: 'REM-0007', talle: 'M' })
  })

  it('acepta talles con guiones o espacios después del SKU', () => {
    expect(parsearSku('PAN-0012-XL-2')).toEqual({ baseSku: 'PAN-0012', talle: 'XL-2' })
  })

  it('devuelve talle null cuando sólo viene el SKU', () => {
    expect(parsearSku('REM-0007')).toEqual({ baseSku: 'REM-0007', talle: null })
  })

  it('normaliza mayúsculas y espacios de lo que tipeó el operador', () => {
    expect(parsearSku('  rem-0007-m ')).toEqual({ baseSku: 'REM-0007', talle: 'M' })
  })

  it('deja entero un SKU cargado a mano que no sigue el patrón', () => {
    expect(parsearSku('ABC123')).toEqual({ baseSku: 'ABC123', talle: null })
  })
})

describe('escaparPatronLike', () => {
  it('escapa los comodines de LIKE y la barra invertida', () => {
    expect(escaparPatronLike('50%_off\\x')).toBe('50\\%\\_off\\\\x')
  })

  it('no toca el texto sin comodines', () => {
    expect(escaparPatronLike('Remera lisa, negra (M)')).toBe('Remera lisa, negra (M)')
  })
})

describe('decidirLookupPorTalle y armarRespuestaElegirTalle', () => {
  it('1. SKU con talle (REM-0007-M) filtra directo por ese talle aunque la categoría tenga talles', () => {
    const parsed = parsearSku('REM-0007-M')
    expect(parsed).toEqual({ baseSku: 'REM-0007', talle: 'M' })
    const decision = decidirLookupPorTalle({
      tallesCategoria: ['S', 'M', 'L'],
      talleExplicito: parsed.talle,
      sinTalleExplicito: false,
    })
    expect(decision).toEqual({ modo: 'filtrar', filtroTalle: 'M' })
  })

  it('2. SKU sin talle en categoría sin talles filtra sin restricción de talle (undefined)', () => {
    const parsed = parsearSku('ACC-0001')
    expect(parsed).toEqual({ baseSku: 'ACC-0001', talle: null })
    const decision = decidirLookupPorTalle({
      tallesCategoria: [],
      talleExplicito: parsed.talle,
      sinTalleExplicito: false,
    })
    expect(decision).toEqual({ modo: 'filtrar', filtroTalle: undefined })
  })

  it('3. SKU sin talle en categoría con talles pide elegir-talle con stock libre por talle en orden de categoría', () => {
    const parsed = parsearSku('REM-0007')
    expect(parsed).toEqual({ baseSku: 'REM-0007', talle: null })
    const decision = decidirLookupPorTalle({
      tallesCategoria: ['S', 'M', 'L'],
      talleExplicito: parsed.talle,
      sinTalleExplicito: false,
    })
    expect(decision).toEqual({ modo: 'desambiguar' })

    const respuesta = armarRespuestaElegirTalle({
      idProducto: 'prod-1',
      productoNombre: 'Remera Básica',
      tallesCategoria: ['S', 'M', 'L'],
      libres: [{ talle: 'L' }, { talle: 'M' }, { talle: 'M' }, { talle: 'XL' }],
    })
    expect(respuesta).toEqual({
      ok: false,
      reason: 'elegir-talle',
      id_producto: 'prod-1',
      producto_nombre: 'Remera Básica',
      talles: [
        { talle: 'M', disponibles: 2, reservados: 0 },
        { talle: 'L', disponibles: 1, reservados: 0 },
        { talle: 'XL', disponibles: 1, reservados: 0 },
      ],
      sin_talle: 0,
      sin_talle_reservados: 0,
      id_reserva: null,
    })
  })

  it('4. Unidades sin_talle en categoría con talles se ofrecen aparte y se eligen con sin_talle=1', () => {
    const respuesta = armarRespuestaElegirTalle({
      idProducto: 'prod-1',
      productoNombre: 'Remera Básica',
      tallesCategoria: ['S', 'M'],
      libres: [{ talle: 'S' }, { talle: null }, { talle: null }],
      reservados: [{ talle: null, idReserva: 'res-1' }],
    })
    expect(respuesta).toEqual({
      ok: false,
      reason: 'elegir-talle',
      id_producto: 'prod-1',
      producto_nombre: 'Remera Básica',
      talles: [{ talle: 'S', disponibles: 1, reservados: 0 }],
      sin_talle: 2,
      sin_talle_reservados: 1,
      id_reserva: 'res-1',
    })

    const decisionSinTalle = decidirLookupPorTalle({
      tallesCategoria: ['S', 'M'],
      talleExplicito: null,
      sinTalleExplicito: true,
    })
    expect(decisionSinTalle).toEqual({ modo: 'filtrar', filtroTalle: null })
  })

  it('5. Producto sin stock devuelve sku-sin-stock (o sku-sin-stock-libre cuando hay disponibles bloqueadas)', () => {
    const sinStock = armarRespuestaElegirTalle({
      idProducto: 'prod-1',
      productoNombre: 'Remera Básica',
      tallesCategoria: ['S', 'M'],
      libres: [],
      totalDisponible: 0,
    })
    expect(sinStock).toEqual({
      ok: false,
      reason: 'sku-sin-stock',
      id_producto: 'prod-1',
      id_reserva: null,
    })

    const sinStockLibre = armarRespuestaElegirTalle({
      idProducto: 'prod-1',
      productoNombre: 'Remera Básica',
      tallesCategoria: ['S', 'M'],
      libres: [],
      reservados: [],
      reservasBloqueantes: ['res-1', 'res-2'],
      totalDisponible: 2,
    })
    expect(sinStockLibre).toEqual({
      ok: false,
      reason: 'sku-sin-stock-libre',
      id_producto: 'prod-1',
      id_reserva: 'res-1',
    })
  })
})

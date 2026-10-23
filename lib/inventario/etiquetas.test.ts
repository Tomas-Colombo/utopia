import { describe, expect, it } from 'vitest'
import {
  buildEtiquetasIngresoHref,
  buildEtiquetasProductoHref,
  calcularPaginacionTanda,
  parsearParamsEtiquetas,
} from './etiquetas'

const UUID_A = '11111111-2222-3333-4444-555555555555'
const UUID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('parsearParamsEtiquetas', () => {
  it('devuelve vacio cuando no vienen parametros o qrs viene en blanco', () => {
    expect(parsearParamsEtiquetas({})).toEqual({ tipo: 'vacio' })
    expect(parsearParamsEtiquetas({ qrs: '  ,  ' })).toEqual({ tipo: 'vacio' })
  })

  it('parsea ingreso con UUID valido y tanda por defecto 1 o explicita', () => {
    expect(parsearParamsEtiquetas({ ingreso: UUID_A })).toEqual({
      tipo: 'ingreso',
      idIngreso: UUID_A,
      tanda: 1,
    })
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, tanda: '3' })).toEqual({
      tipo: 'ingreso',
      idIngreso: UUID_A,
      tanda: 3,
    })
  })

  it('rechaza ingreso con UUID invalido o mezclado con producto', () => {
    expect(parsearParamsEtiquetas({ ingreso: 'no-es-uuid' })).toEqual({ tipo: 'invalido' })
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, producto: UUID_B })).toEqual({
      tipo: 'invalido',
    })
  })

  it('parsea producto con talle opcional (__sin__ o valor), incluir_reservados y tanda', () => {
    expect(parsearParamsEtiquetas({ producto: UUID_B })).toEqual({
      tipo: 'producto',
      idProducto: UUID_B,
      talle: null,
      incluirReservados: false,
      tanda: 1,
    })
    expect(
      parsearParamsEtiquetas({
        producto: UUID_B,
        talle: '__sin__',
        incluir_reservados: '1',
        tanda: '2',
      }),
    ).toEqual({
      tipo: 'producto',
      idProducto: UUID_B,
      talle: '__sin__',
      incluirReservados: true,
      tanda: 2,
    })
  })

  it('rechaza producto con UUID invalido o talle vacio / demasiado largo', () => {
    expect(parsearParamsEtiquetas({ producto: '123' })).toEqual({ tipo: 'invalido' })
    expect(parsearParamsEtiquetas({ producto: UUID_B, talle: '   ' })).toEqual({
      tipo: 'invalido',
    })
    expect(
      parsearParamsEtiquetas({ producto: UUID_B, talle: 'X'.repeat(41) }),
    ).toEqual({ tipo: 'invalido' })
  })

  it('rechaza tanda cero, negativa, decimal, no numerica o desbordada', () => {
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, tanda: '0' })).toEqual({ tipo: 'invalido' })
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, tanda: '-2' })).toEqual({ tipo: 'invalido' })
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, tanda: '1.5' })).toEqual({ tipo: 'invalido' })
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, tanda: 'abc' })).toEqual({ tipo: 'invalido' })
    expect(parsearParamsEtiquetas({ ingreso: UUID_A, tanda: '99999' })).toEqual({
      tipo: 'invalido',
    })
  })

  it('normaliza, deduplica y recorta qrs en ETIQUETAS_MAX (200)', () => {
    expect(parsearParamsEtiquetas({ qrs: ' UTP-1 , UTP-2 , UTP-1 ' })).toEqual({
      tipo: 'qrs',
      pedidos: ['UTP-1', 'UTP-2'],
      recortado: false,
      aBuscar: ['UTP-1', 'UTP-2'],
    })

    const muchos = Array.from({ length: 205 }, (_, i) => `UTP-${i + 1}`).join(',')
    const res = parsearParamsEtiquetas({ qrs: muchos })
    expect(res.tipo).toBe('qrs')
    if (res.tipo === 'qrs') {
      expect(res.recortado).toBe(true)
      expect(res.pedidos).toHaveLength(205)
      expect(res.aBuscar).toHaveLength(200)
    }
  })
})

describe('calcularPaginacionTanda', () => {
  it('calcula rangos desde/hasta y totalTandas para 0, 1, 200, 201 y 450 items', () => {
    expect(calcularPaginacionTanda(0, 1)).toEqual({
      tandaActual: 1,
      totalTandas: 1,
      desde: 0,
      hasta: 199,
      tieneAnterior: false,
      tieneSiguiente: false,
    })

    expect(calcularPaginacionTanda(1, 1)).toEqual({
      tandaActual: 1,
      totalTandas: 1,
      desde: 0,
      hasta: 199,
      tieneAnterior: false,
      tieneSiguiente: false,
    })

    expect(calcularPaginacionTanda(200, 1)).toEqual({
      tandaActual: 1,
      totalTandas: 1,
      desde: 0,
      hasta: 199,
      tieneAnterior: false,
      tieneSiguiente: false,
    })

    expect(calcularPaginacionTanda(201, 1)).toEqual({
      tandaActual: 1,
      totalTandas: 2,
      desde: 0,
      hasta: 199,
      tieneAnterior: false,
      tieneSiguiente: true,
    })

    expect(calcularPaginacionTanda(450, 2)).toEqual({
      tandaActual: 2,
      totalTandas: 3,
      desde: 200,
      hasta: 399,
      tieneAnterior: true,
      tieneSiguiente: true,
    })

    expect(calcularPaginacionTanda(450, 3)).toEqual({
      tandaActual: 3,
      totalTandas: 3,
      desde: 400,
      hasta: 599,
      tieneAnterior: true,
      tieneSiguiente: false,
    })
  })
})

describe('buildEtiquetasIngresoHref y buildEtiquetasProductoHref', () => {
  it('arma el href de ingreso con y sin tanda > 1', () => {
    expect(buildEtiquetasIngresoHref(UUID_A)).toBe(
      `/inventario/imprimir-etiquetas?ingreso=${UUID_A}`,
    )
    expect(buildEtiquetasIngresoHref(UUID_A, 2)).toBe(
      `/inventario/imprimir-etiquetas?ingreso=${UUID_A}&tanda=2`,
    )
  })

  it('arma el href de producto con talle, incluir_reservados y tanda', () => {
    expect(buildEtiquetasProductoHref({ idProducto: UUID_B })).toBe(
      `/inventario/imprimir-etiquetas?producto=${UUID_B}`,
    )
    expect(
      buildEtiquetasProductoHref({
        idProducto: UUID_B,
        talle: 'M',
        incluirReservados: true,
        tanda: 3,
      }),
    ).toBe(`/inventario/imprimir-etiquetas?producto=${UUID_B}&talle=M&incluir_reservados=1&tanda=3`)
  })
})

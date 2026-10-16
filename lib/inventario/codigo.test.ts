import { describe, expect, it } from 'vitest'
import { escaparPatronLike, parsearSku } from './codigo'

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

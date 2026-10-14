import { describe, expect, it } from 'vitest'
import { formatearMoneda, formatearPorcentaje, formatearVariacion } from './moneda'

describe('moneda', () => {
  describe('formatearMoneda', () => {
    it('formatea números positivos', () => {
      expect(formatearMoneda(1234)).toBe('$ 1.234')
      expect(formatearMoneda(1234.56)).toBe('$ 1.235')
    })
    
    it('formatea números negativos con signo explícito', () => {
      expect(formatearMoneda(-1234)).toBe('-$ 1.234')
      expect(formatearMoneda(-1234.56)).toBe('-$ 1.235')
    })
    
    it('formatea cero', () => {
      expect(formatearMoneda(0)).toBe('$ 0')
    })
  })

  describe('formatearPorcentaje', () => {
    it('formatea porcentajes', () => {
      expect(formatearPorcentaje(12.3)).toBe('12,3%')
      expect(formatearPorcentaje(12.34)).toBe('12,3%')
      expect(formatearPorcentaje(0)).toBe('0,0%')
    })
  })

  describe('formatearVariacion', () => {
    it('devuelve sin-base si anterior es cero', () => {
      expect(formatearVariacion(100, 0)).toEqual({
        texto: 'sin datos del período anterior',
        direccion: 'sin-base',
      })
    })

    it('devuelve igual si no hay variación', () => {
      expect(formatearVariacion(100, 100)).toEqual({
        texto: '0,0%',
        direccion: 'igual',
      })
    })

    it('devuelve sube con el porcentaje', () => {
      expect(formatearVariacion(150, 100)).toEqual({
        texto: '50,0%',
        direccion: 'sube',
      })
      expect(formatearVariacion(100, 50)).toEqual({
        texto: '100,0%',
        direccion: 'sube',
      })
    })

    it('devuelve baja con el porcentaje absoluto', () => {
      expect(formatearVariacion(50, 100)).toEqual({
        texto: '50,0%',
        direccion: 'baja',
      })
    })
  })
})

import { describe, expect, it } from 'vitest'
import { formatearMesCorto } from './mes'

describe('formatearMesCorto', () => {
  it('abrevia el mes en español y el año a dos dígitos', () => {
    expect(formatearMesCorto('2025-11')).toBe('nov 25')
    expect(formatearMesCorto('2026-01')).toBe('ene 26')
    expect(formatearMesCorto('2026-09')).toBe('sep 26')
  })

  it('cubre los doce meses', () => {
    const esperado = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const obtenido = esperado.map((_, i) =>
      formatearMesCorto(`2026-${String(i + 1).padStart(2, '0')}`).split(' ')[0],
    )
    expect(obtenido).toEqual(esperado)
  })

  it('acepta una fecha completa, se queda con año y mes', () => {
    expect(formatearMesCorto('2025-11-01')).toBe('nov 25')
  })

  it('no depende de la zona horaria ni del locale del runtime', () => {
    // El 1 de cada mes a medianoche UTC cae en el mes anterior en husos
    // negativos: formatearlo con `new Date` + Intl era la fuente del desfase.
    const tz = process.env.TZ
    try {
      for (const zona of ['America/Argentina/Buenos_Aires', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = zona
        expect(formatearMesCorto('2025-12')).toBe('dic 25')
      }
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('devuelve vacío para vacío y el original si no es un mes válido', () => {
    expect(formatearMesCorto('')).toBe('')
    expect(formatearMesCorto('2025-13')).toBe('2025-13')
    expect(formatearMesCorto('basura')).toBe('basura')
  })
})

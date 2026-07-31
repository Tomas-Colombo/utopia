import { describe, expect, it } from 'vitest'
import {
  parseMonedaAR,
  parseRemitoTextItems,
  type TextItemLite,
} from './remito-pdf'

const H = 9 // altura típica de item

// Helper para armar un item de texto con posición.
function t(str: string, x: number, y: number, width: number): TextItemLite {
  return { str, x, y, width, height: H }
}

// Encabezado del remito (coordenadas PDF: y crece hacia arriba).
function header(y: number): TextItemLite[] {
  return [
    t('CANTIDAD', 20, y, 60), // centro 50
    t('DETALLE', 160, y, 80), // centro 200
    t('PRECIO', 420, y, 60), // centro 450
    t('TOTAL', 520, y, 60), // centro 550
  ]
}

describe('parseMonedaAR', () => {
  it('parsea formato ARS con punto de miles', () => {
    expect(parseMonedaAR('$ 33.900')).toBe(33900)
    expect(parseMonedaAR('$ 103.200')).toBe(103200)
    expect(parseMonedaAR('10900')).toBe(10900)
  })

  it('parsea con coma decimal', () => {
    expect(parseMonedaAR('$ 1.234,56')).toBe(1234.56)
    expect(parseMonedaAR('33,50')).toBe(33.5)
  })

  it('devuelve null para vacío o sin dígitos', () => {
    expect(parseMonedaAR('')).toBeNull()
    expect(parseMonedaAR('$ —')).toBeNull()
  })
})

describe('parseRemitoTextItems', () => {
  it('reconstruye filas cantidad/detalle/precio del layout FICCION', () => {
    const page: TextItemLite[] = [
      ...header(700),
      // Fila 1: 2 · BUZO CHOMBA LICEO · $ 33.900 · $ 67.800
      t('2', 48, 680, 6),
      t('BUZO', 160, 680, 30),
      t('CHOMBA', 195, 680, 40),
      t('LICEO', 238, 680, 28),
      t('$ 33.900', 420, 680, 50),
      t('$ 67.800', 520, 680, 50),
      // Fila 2: 8 · REMERA SO SIMPLE · $ 10.900 · $ 87.200
      t('8', 48, 660, 6),
      t('REMERA', 160, 660, 40),
      t('SO', 205, 660, 15),
      t('SIMPLE', 225, 660, 40),
      t('$ 10.900', 420, 660, 50),
      t('$ 87.200', 520, 660, 50),
    ]

    const { lineas, advertencias } = parseRemitoTextItems([page])

    expect(advertencias).toHaveLength(0)
    expect(lineas).toEqual([
      { nombre: 'BUZO CHOMBA LICEO', cantidad: 2, costoUnitario: 33900 },
      { nombre: 'REMERA SO SIMPLE', cantidad: 8, costoUnitario: 10900 },
    ])
  })

  it('ignora la fila de total (footer) sin cantidad ni detalle', () => {
    const page: TextItemLite[] = [
      ...header(700),
      t('5', 48, 680, 6),
      t('PANT', 160, 680, 30),
      t('AXEL', 195, 680, 30),
      t('$ 33.900', 420, 680, 50),
      t('$ 169.500', 520, 680, 50),
      // Footer: solo columna total
      t('$ 1.404.600', 520, 640, 60),
    ]

    const { lineas, advertencias } = parseRemitoTextItems([page])

    expect(lineas).toEqual([{ nombre: 'PANT AXEL', cantidad: 5, costoUnitario: 33900 }])
    expect(advertencias).toHaveLength(0)
  })

  it('devuelve advertencia cuando no encuentra el encabezado', () => {
    const page: TextItemLite[] = [t('hola mundo', 10, 500, 40)]
    const { lineas, advertencias } = parseRemitoTextItems([page])
    expect(lineas).toHaveLength(0)
    expect(advertencias).toHaveLength(1)
  })
})

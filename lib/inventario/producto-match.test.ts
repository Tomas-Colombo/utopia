import { describe, expect, it } from 'vitest'
import { rankearProductos } from './producto-match'

const p = (nombre: string, sku: string | null = null) => ({ nombre, sku })

describe('rankearProductos', () => {
  it('sin texto no sugiere nada', () => {
    expect(rankearProductos([p('Remera')], '   ')).toEqual([])
  })

  it('ordena SKU exacto, prefijo de SKU, prefijo de nombre y luego contiene', () => {
    const productos = [
      p('Buzo rem', null),
      p('Remera lisa', 'X-1'),
      p('Short', 'REM-02'),
      p('Pantalón', 'REM'),
    ]
    expect(rankearProductos(productos, 'rem').map((x) => x.nombre)).toEqual([
      'Pantalón',
      'Short',
      'Remera lisa',
      'Buzo rem',
    ])
  })

  it('ignora acentos y mayúsculas, y respeta el límite', () => {
    const productos = [p('Pantalón A'), p('Pantalon B'), p('Pantalón C')]
    expect(rankearProductos(productos, 'PANTALON', 2).map((x) => x.nombre)).toEqual([
      'Pantalón A',
      'Pantalon B',
    ])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { sanitizeCsvValue, escapeCsvField, downloadCsv, csvNegative } from './csv'

describe('Utilidades CSV', () => {
  it('sanitizeCsvValue antepone apóstrofe si empieza con caracteres peligrosos', () => {
    expect(sanitizeCsvValue('=1+2')).toBe(`'=1+2`)
    expect(sanitizeCsvValue('+A1')).toBe(`'+A1`)
    expect(sanitizeCsvValue('-100')).toBe(`'-100`)
    expect(sanitizeCsvValue('@SUM')).toBe(`'@SUM`)
    expect(sanitizeCsvValue('Normal')).toBe('Normal')
    expect(sanitizeCsvValue(123)).toBe('123')
    expect(sanitizeCsvValue(null)).toBe('')
  })

  it('escapeCsvField escapa comillas y usa sanitización', () => {
    expect(escapeCsvField('Texto "con" comillas')).toBe('"Texto ""con"" comillas"')
    expect(escapeCsvField('=Trampa')).toBe(`"'=Trampa"`)
    expect(escapeCsvField(null)).toBe('""')
  })

  it('csvNegative niega el número y evita doble signo', () => {
    expect(csvNegative(100)).toBe(-100)
    expect(csvNegative(-100)).toBe(100)
    expect(csvNegative(0)).toBe(-0)
    expect(csvNegative(null)).toBe('')
  })

  it('downloadCsv arma el blob con BOM y llama a revokeObjectURL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/123')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const click = vi.fn()
    const createElement = vi.fn().mockReturnValue({ click })
    vi.stubGlobal('document', { createElement })

    const blobMock = vi.fn()
    class MockBlob {
      constructor(content: BlobPart[], options: BlobPropertyBag) {
        blobMock(content, options)
      }
    }
    vi.stubGlobal('Blob', MockBlob)

    downloadCsv('test.csv', 'A,B\n1,2')

    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/123')
    expect(createElement).toHaveBeenCalledWith('a')
    expect(click).toHaveBeenCalled()

    // Verificamos el BOM
    expect(blobMock).toHaveBeenCalledWith(['\uFEFF' + 'A,B\n1,2'], { type: 'text/csv;charset=utf-8;' })

    vi.unstubAllGlobals()
  })
})

import { describe, expect, it } from 'vitest'
import { periodoAnterior } from './periodo'

describe('periodoAnterior', () => {
  it('calcula periodo de 1 dia', () => {
    const r = periodoAnterior('2023-10-15', '2023-10-15', '2023-10-15')
    expect(r.desde).toBe('2023-10-14')
    expect(r.hasta).toBe('2023-10-14')
  })

  it('calcula periodo de un mes', () => {
    const r = periodoAnterior('2023-10-01', '2023-10-31', '2023-11-15')
    // 31 days difference. From 2023-10-01 back 31 days is 2023-08-31
    expect(r.desde).toBe('2023-08-31')
    expect(r.hasta).toBe('2023-09-30')
  })

  it('tira error con fechas invalidas', () => {
    expect(() => periodoAnterior('invalido', '2023-10-15', '2023-10-15')).toThrow()
  })
})

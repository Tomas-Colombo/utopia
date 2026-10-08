import { describe, expect, it } from 'vitest'
import { searchParamsReportesSchema } from './reportes'

describe('searchParamsReportesSchema', () => {
  it('valida parametros correctos', () => {
    const res = searchParamsReportesSchema.safeParse({
      desde: '2023-01-01',
      hasta: '2023-12-31',
      limite: '10',
      orden: 'ganancia',
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.limite).toBe(10)
    }
  })

  it('rellena valores por defecto', () => {
    const res = searchParamsReportesSchema.safeParse({
      desde: '2023-01-01',
      hasta: '2023-12-31',
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.limite).toBe(5)
      expect(res.data.orden).toBe('ganancia')
    }
  })

  it('falla con desde mayor a hasta', () => {
    const res = searchParamsReportesSchema.safeParse({
      desde: '2023-12-31',
      hasta: '2023-01-01',
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0].message).toBe('periodo-invalido')
    }
  })

  it('falla con rango mayor a 366 dias', () => {
    const res = searchParamsReportesSchema.safeParse({
      desde: '2022-01-01',
      hasta: '2023-12-31',
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0].message).toBe('periodo-invalido')
    }
  })

  it('falla con limite fuera de rango', () => {
    const res = searchParamsReportesSchema.safeParse({
      desde: '2023-01-01',
      hasta: '2023-12-31',
      limite: '200',
    })
    expect(res.success).toBe(false)
  })

  it('falla con orden invalido', () => {
    const res = searchParamsReportesSchema.safeParse({
      desde: '2023-01-01',
      hasta: '2023-12-31',
      orden: 'invento',
    })
    expect(res.success).toBe(false)
  })
})

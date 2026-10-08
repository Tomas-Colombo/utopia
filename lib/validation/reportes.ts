import { z } from 'zod'
import { esFechaValida } from '../fechas'

const dateStringSchema = z.string().refine((val) => {
  return esFechaValida(val)
}, { message: 'periodo-invalido' })

export const searchParamsReportesSchema = z.strictObject({
  desde: dateStringSchema,
  hasta: dateStringSchema,
  limite: z.coerce.number().min(1).max(100).default(5),
  orden: z.enum(['ganancia', 'unidades', 'monto']).default('ganancia'),
}).superRefine((data, ctx) => {
  if (!esFechaValida(data.desde) || !esFechaValida(data.hasta)) return

  const [aD, mD, dD] = data.desde.split('-').map(Number)
  const [aH, mH, dH] = data.hasta.split('-').map(Number)

  const dDesde = new Date(aD, mD - 1, dD)
  const dHasta = new Date(aH, mH - 1, dH)

  if (dDesde > dHasta) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodo-invalido',
      path: ['desde'],
    })
    return
  }

  const difDias = Math.floor((dHasta.getTime() - dDesde.getTime()) / (1000 * 3600 * 24))
  if (difDias > 366) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodo-invalido',
      path: ['desde'],
    })
  }
})

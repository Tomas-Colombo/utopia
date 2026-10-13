import { z } from 'zod'

export const tramoEscalaSchema = z.strictObject({
  objetivo_desde: z.number().min(0, 'El monto objetivo no puede ser negativo.'),
  porcentaje: z.number().min(0, 'El porcentaje mínimo es 0.').max(100, 'El porcentaje no puede superar 100.'),
})

export const crearReglaGeneralSchema = z.strictObject({
  ambito: z.enum(['revendedora', 'local']),
  nombre: z.string().trim().min(1, 'El nombre es requerido.').max(100, 'El nombre es muy largo.'),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD).'),
  vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD).').nullable().optional(),
  escalas: z.array(tramoEscalaSchema).min(1, 'Debe configurar al menos un tramo de comisión.'),
})

export const guardarComisionPropiaSchema = z.strictObject({
  id_revendedora: z.string().uuid('ID de revendedora inválido.'),
  tipo: z.enum(['fijo', 'escala']),
  porcentajeFijo: z.number().min(0, 'El porcentaje no puede ser negativo.').max(100, 'El porcentaje no puede superar 100.').optional(),
  escalas: z.array(tramoEscalaSchema).optional(),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD).'),
  vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD).').nullable().optional(),
})

export const terminarReglaSchema = z.strictObject({
  id_regla: z.string().uuid('ID de regla inválido.'),
  vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD).').optional(),
})

export type CrearReglaGeneralInput = z.infer<typeof crearReglaGeneralSchema>
export type GuardarComisionPropiaInput = z.infer<typeof guardarComisionPropiaSchema>
export type TerminarReglaInput = z.infer<typeof terminarReglaSchema>

import { z } from 'zod'

export const revendedoraSchema = z.strictObject({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'El nombre es muy largo'),
  apellido: z.string().trim().min(1, 'El apellido es obligatorio').max(100, 'El apellido es muy largo'),
  telefono: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email('El formato del email no es válido').nullable().optional().or(z.literal('')),
  notas: z.string().trim().max(1000).nullable().optional(),
})

export type RevendedoraPayload = z.infer<typeof revendedoraSchema>

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

const optionalDateSchema = z
  .string()
  .trim()
  .regex(dateRegex, 'Formato de fecha inválido (AAAA-MM-DD)')
  .nullable()
  .optional()
  .or(z.literal(''))
  .transform((val) => (val ? val : null))

export const crearConsignacionRevendedoraSchema = z.strictObject({
  id_revendedora: z.string().uuid('id-revendedora-invalido'),
  items: z
    .array(z.string().uuid('id-item-invalido'))
    .min(1, 'items-vacios')
    .max(200, 'demasiados-items')
    .transform((items) => Array.from(new Set(items))),
  periodo_desde: optionalDateSchema,
  periodo_hasta: optionalDateSchema,
  observaciones: z
    .string()
    .trim()
    .max(1000, 'observaciones-largas')
    .nullable()
    .optional()
    .transform((val) => (val ? val : null)),
  motivo: z
    .string()
    .trim()
    .max(500, 'motivo-largo')
    .nullable()
    .optional()
    .transform((val) => (val ? val : null)),
})

export type CrearConsignacionRevendedoraPayload = z.infer<typeof crearConsignacionRevendedoraSchema>

export const editarConsignacionRevendedoraSchema = z.strictObject({
  id_consignacion_revendedora: z.string().uuid('id-consignacion-invalido'),
  periodo_desde: optionalDateSchema,
  periodo_hasta: optionalDateSchema,
  observaciones: z
    .string()
    .trim()
    .max(1000, 'observaciones-largas')
    .nullable()
    .optional()
    .transform((val) => (val ? val : null)),
})

export type EditarConsignacionRevendedoraPayload = z.infer<typeof editarConsignacionRevendedoraSchema>

export const confirmarConsignacionRevendedoraSchema = z.strictObject({
  id_consignacion_revendedora: z.string().uuid('id-consignacion-invalido'),
})

export type ConfirmarConsignacionRevendedoraPayload = z.infer<typeof confirmarConsignacionRevendedoraSchema>

export const registrarDevolucionRevendedoraSchema = z.strictObject({
  id_consignacion_revendedora: z.string().uuid('id-consignacion-invalido'),
  items: z
    .array(z.string().uuid('id-item-invalido'))
    .min(1, 'items-vacios')
    .max(200, 'demasiados-items')
    .transform((items) => Array.from(new Set(items))),
  estado_destino: z.enum(['disponible', 'devuelto', 'baja']),
  motivo: z
    .string()
    .trim()
    .max(500, 'motivo-largo')
    .nullable()
    .optional()
    .transform((val) => (val ? val : null)),
})

export type RegistrarDevolucionRevendedoraPayload = z.infer<typeof registrarDevolucionRevendedoraSchema>

export const cerrarConsignacionRevendedoraSchema = z.strictObject({
  id_consignacion_revendedora: z.string().uuid('id-consignacion-invalido'),
})

export type CerrarConsignacionRevendedoraPayload = z.infer<typeof cerrarConsignacionRevendedoraSchema>

export const eliminarConsignacionRevendedoraSchema = z.strictObject({
  id_consignacion_revendedora: z.string().uuid('id-consignacion-invalido'),
})

export type EliminarConsignacionRevendedoraPayload = z.infer<typeof eliminarConsignacionRevendedoraSchema>

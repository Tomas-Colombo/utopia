import { z } from 'zod'

export const revendedoraSchema = z.strictObject({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'El nombre es muy largo'),
  apellido: z.string().trim().min(1, 'El apellido es obligatorio').max(100, 'El apellido es muy largo'),
  telefono: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email('El formato del email no es válido').nullable().optional().or(z.literal('')),
  notas: z.string().trim().max(1000).nullable().optional(),
})

export type RevendedoraPayload = z.infer<typeof revendedoraSchema>

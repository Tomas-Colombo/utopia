import { z } from 'zod'

/**
 * Validación de runtime del motivo de anulación. El `maxLength` del textarea
 * es una comodidad de la UI, no un límite: el Server Action es un POST que
 * cualquiera puede mandar a mano (ver `lib/validation/administracion` para el
 * razonamiento completo), y `venta.motivo_anulacion` es `text` sin tope, así
 * que sin esto entra un motivo de cualquier tamaño.
 *
 * Mismo formato de `reason` kebab que el resto de los actions.
 */
export const anularVentaSchema = z.strictObject(
  {
    idVenta: z.uuid('id-venta-invalido'),
    motivo: z
      .string('motivo-invalido')
      .max(300, 'motivo-largo')
      .optional()
      // Un motivo en blanco es lo mismo que no haber puesto motivo: se
      // normaliza a `undefined` para que el SP lo guarde como NULL.
      .transform((m) => {
        const t = m?.trim()
        return t ? t : undefined
      }),
  },
  {
    error: (issue: z.core.$ZodRawIssue) =>
      issue.code === 'unrecognized_keys' ? 'campo-desconocido' : 'payload-invalido',
  },
)

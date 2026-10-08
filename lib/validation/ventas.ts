import { z } from 'zod'

const medioPagoSchema = z.enum(['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito'])

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

export const devolverItemVentaSchema = z.strictObject(
  {
    idDetalleVenta: z.uuid('id-detalle-invalido'),
    idVenta: z.uuid('id-venta-invalido'),
    motivo: z
      .string('motivo-invalido')
      .max(300, 'motivo-largo')
      .optional()
      .transform((m) => {
        const t = m?.trim()
        return t ? t : undefined
      }),
    idCuentaReintegro: z.string().uuid('cuenta-invalida').optional().nullable()
      .transform((id) => id || undefined),
    medioReintegro: medioPagoSchema.optional().nullable()
      .transform((m) => m || undefined)
  },
  {
    error: (issue: z.core.$ZodRawIssue) =>
      issue.code === 'unrecognized_keys' ? 'campo-desconocido' : 'payload-invalido',
  },
)

/**
 * Topes de unidades, compartidos por el formulario y las Server Actions.
 *
 * Vive acá (sin `'use client'` ni `'server-only'`) porque lo necesitan los dos
 * lados: el input clampea para que el usuario vea el límite, y la action lo
 * vuelve a chequear porque el payload lo arma el navegador y se puede falsear.
 */

/** Unidades máximas por línea de stock o de remito. */
export const MAX_UNIDADES_LINEA = 1000

/** Unidades máximas que puede generar UNA operación (alta o ingreso completo). */
export const MAX_UNIDADES_OPERACION = 5000

/**
 * Tope del PDF de remito, atado al `bodySizeLimit` de Server Actions de Next
 * (1MB por defecto; `next.config.ts` no lo cambia). Por encima de eso el
 * request muere en el framework y la action ni se ejecuta, así que el cap
 * explícito existe para dar un mensaje entendible en vez de un error opaco.
 * Si algún día hay que aceptar remitos escaneados, se suben los DOS números.
 */
export const MAX_PDF_BYTES = 1024 * 1024

/**
 * Valida las unidades de una línea. Devuelve el mensaje de error, o `null` si
 * está bien — así encaja directo en el `reason` que devuelven las actions.
 *
 * Rechaza fraccionarios de forma explícita: cada unidad es una fila en
 * `item_producto`, así que "2.5 remeras" no tiene representación posible.
 */
export function unidadesInvalidas(cantidad: unknown, contexto: string): string | null {
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
    return `cantidad inválida en "${contexto}": tiene que ser un entero positivo`
  }
  if (cantidad > MAX_UNIDADES_LINEA) {
    return `"${contexto}": ${cantidad} unidades supera el máximo por línea (${MAX_UNIDADES_LINEA}). Dividí la carga.`
  }
  return null
}

/** Mensaje único para cuando la operación completa se pasa del tope. */
export function excedeOperacion(total: number): string {
  return `La carga suma ${total} unidades y el máximo por operación es ${MAX_UNIDADES_OPERACION}. Dividila en varias.`
}

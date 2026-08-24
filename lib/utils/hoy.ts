/**
 * La fecha de HOY del negocio, no la del servidor.
 *
 * `new Date().toLocaleDateString('en-CA')` devuelve la fecha del proceso, y
 * el proceso corre en UTC (Vercel). Entre las 21:00 y la medianoche de
 * Argentina eso ya es el día siguiente: una cuota que vence hoy aparecía como
 * VENCIDA, y una que vence mañana como "vence hoy" — justo en el horario en
 * el que se cierra el local y se mira el tablero.
 *
 * Todo lo que compare contra `fecha_vencimiento` tiene que salir de acá.
 * `fecha_vencimiento` es una FECHA de calendario (`date` en Postgres, sin
 * hora ni huso), así que la única comparación honesta es contra la fecha de
 * calendario del lugar donde está el mostrador.
 */

/**
 * Huso del comercio. Constante y no configurable por ahora: el producto es
 * de un solo país y toda la UI está en es-AR. El día que haya tenants en otro
 * huso, esto pasa a ser una columna de `tenant` y este módulo la lee.
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

const FORMATO_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `YYYY-MM-DD` de hoy en el huso del comercio. */
export function hoyISO(ahora: Date = new Date()): string {
  return FORMATO_ISO.format(ahora)
}

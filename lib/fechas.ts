/**
 * Utilidades de fecha compartidas entre server y client components.
 *
 * Regla de oro acá: NUNCA usar `toISOString()` para obtener un día calendario.
 * `toISOString()` convierte a UTC, así que a las 21:30 en Argentina (UTC-3)
 * devuelve el día SIGUIENTE. Para un local que vende de tarde eso significa
 * registrar y filtrar ventas con la fecha equivocada. `aFechaLocal` usa los
 * getters locales, que es lo correcto para un día calendario.
 */

/** `Date` → `YYYY-MM-DD` en la zona horaria del usuario (sin corrimiento UTC). */
export function aFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

export interface RangoFechas {
  /** Día inicial inclusivo, `YYYY-MM-DD`. */
  desde: string
  /** Día final inclusivo, `YYYY-MM-DD`. */
  hasta: string
}

/** Primer y último día del mes en curso. */
export function mesActual(hoy = new Date()): RangoFechas {
  return {
    desde: aFechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    // Día 0 del mes siguiente = último día de este mes.
    hasta: aFechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  }
}

/** Primer y último día del mes anterior. */
export function mesAnterior(hoy = new Date()): RangoFechas {
  return {
    desde: aFechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    hasta: aFechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
  }
}

/** El día de hoy, como rango de un solo día. */
export function hoyRango(hoy = new Date()): RangoFechas {
  const dia = aFechaLocal(hoy)
  return { desde: dia, hasta: dia }
}

/** Año calendario en curso. */
export function anioActual(hoy = new Date()): RangoFechas {
  return {
    desde: aFechaLocal(new Date(hoy.getFullYear(), 0, 1)),
    hasta: aFechaLocal(new Date(hoy.getFullYear(), 11, 31)),
  }
}

/** `YYYY-MM-DD` válido (y además una fecha real, no `2026-02-31`). */
export function esFechaValida(valor: string | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [anio, mes, dia] = valor.split('-').map(Number)
  const d = new Date(anio, mes - 1, dia)
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia
}

/**
 * Convierte un día calendario en el instante de arranque de ESE día.
 * Sin offset explícito: lo interpreta la base con su zona horaria, igual que
 * el resto de los filtros de fecha de la app.
 */
export function inicioDelDia(fecha: string): string {
  return `${fecha}T00:00:00`
}

/**
 * Instante de arranque del día SIGUIENTE — el tope superior EXCLUSIVO de un
 * rango que incluye a `fecha` entera.
 *
 * `venta.fecha` es `timestamptz` (00021). Comparar con `<= '2026-08-31'` lo
 * resuelve como `<= 2026-08-31T00:00:00`, así que se perdería todo lo vendido
 * ese día. Por eso el tope es exclusivo y apunta al día siguiente.
 */
export function inicioDelDiaSiguiente(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const siguiente = new Date(anio, mes - 1, dia + 1)
  return `${aFechaLocal(siguiente)}T00:00:00`
}

import { esFechaValida, aFechaLocal } from '../fechas'

/**
 * REQ-APP-05: Devuelve un período anterior de la misma longitud que el actual
 * para poder compararlos (por ej. "últimos 30 días" contra "30 días anteriores").
 *
 * @param desde - Fecha de inicio YYYY-MM-DD
 * @param hasta - Fecha de fin YYYY-MM-DD
 * @param hoy - Fecha de hoy YYYY-MM-DD (para no usar Date.now() ni la zona del proceso)
 * @returns Rango anterior de fechas YYYY-MM-DD
 */
export function periodoAnterior(desde: string, hasta: string, hoy: string): { desde: string; hasta: string } {
  if (!esFechaValida(desde) || !esFechaValida(hasta) || !esFechaValida(hoy)) {
    throw new Error('Fechas inválidas')
  }

  const [aD, mD, dD] = desde.split('-').map(Number)
  const [aH, mH, dH] = hasta.split('-').map(Number)

  const dDesde = new Date(aD, mD - 1, dD)
  const dHasta = new Date(aH, mH - 1, dH)

  // +1 porque si desde y hasta son el mismo día, es 1 día de longitud
  const longitud = Math.floor((dHasta.getTime() - dDesde.getTime()) / (1000 * 3600 * 24)) + 1

  const nuevoHasta = new Date(aD, mD - 1, dD - 1)
  const nuevoDesde = new Date(nuevoHasta.getFullYear(), nuevoHasta.getMonth(), nuevoHasta.getDate() - (longitud - 1))

  return {
    desde: aFechaLocal(nuevoDesde),
    hasta: aFechaLocal(nuevoHasta),
  }
}

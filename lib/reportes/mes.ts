/**
 * Abreviaturas fijas en lugar de `Intl.DateTimeFormat('es-AR')`: Node (SSR) y
 * el navegador traen versiones de ICU distintas y abrevian distinto el mes
 * ("nov" contra "nov."), lo que rompía la hidratación de /reportes.
 */
const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

/** 'YYYY-MM' (o 'YYYY-MM-DD') -> 'nov 25'. Vacío -> vacío; inválido -> el original. */
export function formatearMesCorto(mes: string): string {
  if (!mes) return ''
  const coincide = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(mes)
  if (!coincide) return mes
  const nombre = MESES_CORTOS[Number(coincide[2]) - 1]
  if (!nombre) return mes
  return `${nombre} ${coincide[1].slice(2)}`
}

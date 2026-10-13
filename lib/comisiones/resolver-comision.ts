import type {
  AmbitoComision,
  EstimacionComision,
  ReglaComisionConEscalas,
  ResolucionComision,
} from '@/lib/types/comisiones'

export type {
  AmbitoComision,
  EstimacionComision,
  ReglaComisionConEscalas,
  ResolucionComision,
}

/**
 * Parámetros para resolver la comisión aplicable.
 */
export interface ParametrosResolucionComision {
  idRevendedora: string | null
  ambito?: AmbitoComision
  fecha: string
  montoPeriodo: number
}

/**
 * Resuelve la comisión aplicable espejando exactamente `fn_resolver_comision` (00086).
 *
 * Precedencia:
 * 1. Regla propia de la revendedora activa y vigente para la fecha.
 * 2. Regla general del tenant para el ámbito activo y vigente para la fecha.
 * 3. Fallback: 0% con marca `sin_regla = true`. Nunca excepción (NR-34).
 *
 * Módulo puro: sin DB, sin `server-only`. Usable tanto en server actions como en componentes UI cliente.
 */
export function resolverComision(
  reglas: ReglaComisionConEscalas[],
  params: ParametrosResolucionComision,
): ResolucionComision {
  const ambito = params.ambito ?? 'revendedora'
  const fecha = params.fecha
  const monto = Number.isFinite(params.montoPeriodo) ? params.montoPeriodo : 0

  let reglaSeleccionada: ReglaComisionConEscalas | null = null
  let origen: 'propia' | 'general' | 'ninguna' = 'ninguna'

  // 1. Regla propia si se proveyó idRevendedora
  if (params.idRevendedora) {
    const candidatasPropias = reglas.filter((r) => {
      if (!r.activo) return false
      if (r.ambito !== 'revendedora') return false
      if (r.id_revendedora !== params.idRevendedora) return false
      if (r.vigente_desde > fecha) return false
      if (r.vigente_hasta !== null && r.vigente_hasta < fecha) return false
      return true
    })

    if (candidatasPropias.length > 0) {
      candidatasPropias.sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))
      reglaSeleccionada = candidatasPropias[0]
      origen = 'propia'
    }
  }

  // 2. Si no hay regla propia, buscar regla general
  if (!reglaSeleccionada) {
    const candidatasGenerales = reglas.filter((r) => {
      if (!r.activo) return false
      if (r.ambito !== ambito) return false
      if (r.id_revendedora !== null) return false
      if (r.vigente_desde > fecha) return false
      if (r.vigente_hasta !== null && r.vigente_hasta < fecha) return false
      return true
    })

    if (candidatasGenerales.length > 0) {
      candidatasGenerales.sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))
      reglaSeleccionada = candidatasGenerales[0]
      origen = 'general'
    }
  }

  // 3. Fallback si no hay regla
  if (!reglaSeleccionada) {
    return {
      porcentaje: 0,
      origen: 'ninguna',
      id_regla: null,
      sin_regla: true,
    }
  }

  // 4. Buscar tramo en la escala
  const escalasOrdenadas = [...reglaSeleccionada.escalas].sort(
    (a, b) => b.objetivo_desde - a.objetivo_desde,
  )

  const tramoAplicable = escalasOrdenadas.find((e) => e.objetivo_desde <= monto)

  if (!tramoAplicable) {
    // La regla existe pero el monto está por debajo del piso
    return {
      porcentaje: 0,
      origen,
      id_regla: reglaSeleccionada.id_regla,
      sin_regla: false,
    }
  }

  return {
    porcentaje: tramoAplicable.porcentaje,
    origen,
    id_regla: reglaSeleccionada.id_regla,
    sin_regla: false,
  }
}

/**
 * Estimación informativa de comisión en UI.
 *
 * Rotulado siempre como "estimación" o "preview". No reemplaza la liquidación autoritativa en SQL.
 */
export function estimarComision(
  precio: number,
  porcentaje: number,
): EstimacionComision {
  const pct = Number.isFinite(porcentaje) && porcentaje > 0 ? porcentaje : 0
  if (!Number.isFinite(precio) || precio <= 0 || pct <= 0) {
    return {
      porcentaje: pct,
      montoEstimado: 0,
    }
  }

  const montoEstimado = Math.round(precio * (pct / 100) * 100) / 100

  return {
    porcentaje: pct,
    montoEstimado,
  }
}

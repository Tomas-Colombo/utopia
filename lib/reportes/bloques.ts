import { Session } from '../dal/session'
import { hasModuleAccess } from '../dal/guard'

export type TipoBloqueFinanzas = 'resultados' | 'flujo' | 'serie' | 'cobrar' | 'gastos' | 'mercaderia' | 'ranking' | 'proveedores'

/**
 * REQ-APP-04: Mapeo de bloques a módulos y permisos requeridos para verlos
 */
export function bloquesVisibles(session: Session): TipoBloqueFinanzas[] {
  const visibles: TipoBloqueFinanzas[] = []

  // - resultados/flujo/serie/cobrar → módulo ventas
  if (hasModuleAccess(session, 'ventas', 'ver')) {
    visibles.push('resultados', 'flujo', 'serie', 'cobrar')
  }

  // - gastos → módulo gastos
  if (hasModuleAccess(session, 'gastos', 'ver')) {
    visibles.push('gastos')
  }

  // - mercaderia/ranking → módulo inventario
  if (hasModuleAccess(session, 'inventario', 'ver')) {
    visibles.push('mercaderia', 'ranking')
  }

  // - proveedores → módulo rendiciones
  if (hasModuleAccess(session, 'rendiciones', 'ver')) {
    visibles.push('proveedores')
  }

  return visibles
}

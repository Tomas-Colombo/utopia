const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_PRODUCTOS_STOCK_DISPONIBLE = 50
export const MAX_CANTIDAD_LOOKUP = 50

/**
 * Parsea y acota la cantidad solicitada en una búsqueda de stock/carrito.
 * Entero entre 1 y MAX_CANTIDAD_LOOKUP (50). Por defecto 1.
 */
export function parsearCantidadLookup(raw?: string | null): number {
  if (!raw || !raw.trim()) return 1
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), MAX_CANTIDAD_LOOKUP)
}

/**
 * Evalúa si el stock libre alcanza para cubrir la cantidad pedida.
 * Si alcanza, entrega la pedida sin aviso.
 * Si hay menos, entrega las que hay y marca el aviso 'stock-parcial-disponible'.
 */
export function evaluarCantidadDisponible(
  pedida: number,
  disponibles: number,
): {
  entregadas: number
  incompleto: boolean
  aviso?: 'stock-parcial-disponible'
} {
  const ped = Math.max(1, pedida)
  const disp = Math.max(0, disponibles)
  const entregadas = Math.min(ped, disp)
  const incompleto = entregadas < ped && entregadas > 0

  return {
    entregadas,
    incompleto,
    aviso: incompleto ? 'stock-parcial-disponible' : undefined,
  }
}

/**
 * Deduplica, valida formato UUID y recorta la lista de productos consultados
 * para evitar DoS o desborde en consultas de stock por tanda.
 */
export function validarYFiltrarIdsProductos(
  ids: string[],
  max = MAX_PRODUCTOS_STOCK_DISPONIBLE,
): string[] {
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const validos = unicos.filter((id) => UUID_RE.test(id))
  return validos.slice(0, max)
}

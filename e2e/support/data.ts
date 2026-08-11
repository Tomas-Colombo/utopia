import { randomUUID } from 'node:crypto'

/**
 * Collision-safe display name for anything a spec creates.
 *
 * Uniqueness is not cosmetic here: `producto.nombre`, `categoria.nombre`,
 * `cuenta_destino.nombre` and friends are unique per tenant, so a fixed name
 * would make a spec pass once and fail on every re-run against the same
 * tenant, and would couple specs that happen to create the same entity.
 */
export function unique(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`
}

/** Same idea for values that must look like an email. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@example.com`
}

/** `YYYY-MM-DD` for native date inputs, offset by whole days from today. */
export function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

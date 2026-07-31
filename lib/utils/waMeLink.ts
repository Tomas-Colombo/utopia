/**
 * Builds a wa.me link (Planificacion.txt Etapa 3 §66 "botón wa.me").
 * Returns null when there is no phone number. Does NOT validate the
 * format — a supplier may have an odd number and wa.me still works.
 *
 * Pure/isomorphic: no Supabase, no `next/headers`, no `server-only`.
 * Safe to import from both Server and Client Components.
 */
export function waMeLink(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  const digits = telefono.replace(/\D/g, '')
  if (digits.length < 6) return null
  return `https://wa.me/${digits}`
}

/**
 * Marca del tenant en el rail: su logo (PNG/SVG con fondo transparente, sube
 * a `tenant-logos`) o, mientras no tenga uno cargado, su nombre en texto.
 * Nada de esto está atado a un cliente: la marca viene de `session.marca`.
 */
export function Logo({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL externa del bucket, tamaño fijo por CSS
      <img
        src={logoUrl}
        alt={nombre}
        className="h-9 w-auto max-w-full shrink-0 select-none object-contain"
      />
    )
  }

  return (
    <span className="truncate font-display text-lg uppercase tracking-[-0.01em] text-sidebar-ink">
      {nombre}
    </span>
  )
}

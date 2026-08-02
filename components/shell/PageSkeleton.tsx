import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Primitivas para los `loading.tsx` de cada módulo.
 *
 * Next anida `loading.tsx` dentro del `layout.tsx` del segmento y envuelve la
 * `page` en un `<Suspense>`. Como el fallback se prefetchea, aparece en ~65ms
 * en vez de esperar los ~600ms que tardan las queries de la page.
 *
 * Criterio: todo lo que NO depende de datos (título, encabezados de sección)
 * se pinta completo; solo va a esqueleto lo que sí. Las clases replican las de
 * las pages reales para que no haya salto de layout al entrar el contenido.
 */

/** Encabezado con el título real. `Topbar` pide `session`, que acá no existe. */
export function SkeletonTopbar({ title }: { title: string }) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-topbar px-6 py-3 pl-16 pr-24 backdrop-blur md:pl-6"
      aria-label="Barra superior"
    >
      <h1 className="truncate font-display text-lg uppercase tracking-[-0.01em] text-ink">
        {title}
      </h1>
    </header>
  )
}

/** Grilla de KPIs. Coincide con `grid-cols-2 md:grid-cols-4` de las pages. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton width="60%" height="0.75rem" />
          <div className="mt-2">
            <Skeleton width="45%" height="1.75rem" />
          </div>
        </div>
      ))}
    </section>
  )
}

/** Tarjetas de navegación (accesos a sub-módulos). */
export function SkeletonCards({
  count = 2,
  columns = 2,
}: {
  count?: number
  columns?: 2 | 3
}) {
  const cols = columns === 3 ? 'sm:grid-cols-3' : 'md:grid-cols-2'
  return (
    <section className={`grid grid-cols-1 gap-3 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5">
          <Skeleton width="35%" height="0.875rem" />
          <div className="mt-2">
            <Skeleton width="55%" height="1.5rem" />
          </div>
          <div className="mt-3">
            <Skeleton width="85%" height="0.875rem" />
          </div>
        </div>
      ))}
    </section>
  )
}

/**
 * Panel de tabla. `title` se pinta real cuando el encabezado es estático;
 * omitirlo deja el panel sin cabecera (caso de tablas con filtros propios).
 */
export function SkeletonTable({
  title,
  rows = 8,
}: {
  title?: string
  rows?: number
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      {title && (
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-display text-lg">{title}</h3>
        </div>
      )}
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} width="100%" height="1.25rem" />
        ))}
      </div>
    </section>
  )
}

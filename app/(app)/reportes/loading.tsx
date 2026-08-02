import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonKpis, SkeletonTable, SkeletonTopbar } from '@/components/shell/PageSkeleton'

/**
 * Reportes es la page más pesada: panel financiero del período + tres tablas.
 * El selector de período va a esqueleto porque es un client component con
 * estado inicial derivado del server.
 */
export default function LoadingReportes() {
  return (
    <>
      <SkeletonTopbar title="Reportes" />
      <main className="flex-1 p-6 space-y-6" aria-busy="true">
        <Skeleton width="100%" height="3.5rem" />

        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h3 className="font-display text-lg">Financiero del período</h3>
          <SkeletonKpis />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <Skeleton width="65%" height="0.75rem" />
                <div className="mt-2">
                  <Skeleton width="45%" height="1.75rem" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <SkeletonTable rows={6} />
        <SkeletonTable rows={6} />
        <SkeletonTable rows={6} />
      </main>
    </>
  )
}

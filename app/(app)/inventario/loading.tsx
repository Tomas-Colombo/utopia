import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonCards, SkeletonKpis, SkeletonTopbar } from '@/components/shell/PageSkeleton'

/**
 * Estado de carga instantáneo de la home de Inventario.
 *
 * Cubre las queries de la page (productos + alertas + KPIs), que es el tramo
 * largo de la navegación. Las alertas no se esbozan: son condicionales y
 * dibujar un hueco que después no aparece sería peor que no dibujar nada.
 */
export default function LoadingInventario() {
  return (
    <>
      <SkeletonTopbar title="Inventario" />
      <main className="flex-1 space-y-6 p-4 sm:p-6" aria-busy="true">
        <SkeletonKpis />
        <SkeletonCards count={3} columns={3} />

        <section className="space-y-3">
          <h3 className="font-display text-lg">Productos</h3>
          <Skeleton width="100%" height="2.5rem" />
          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            <div className="border-b border-line bg-panel-2 px-4 py-3">
              <Skeleton width="40%" height="0.625rem" />
            </div>
            <div className="divide-y divide-line">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5">
                  <Skeleton width="100%" height="1rem" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

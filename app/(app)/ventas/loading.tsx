import { Skeleton } from '@/components/ui/Skeleton'
import {
  SkeletonCards,
  SkeletonKpis,
  SkeletonTable,
  SkeletonTopbar,
} from '@/components/shell/PageSkeleton'

export default function LoadingVentas() {
  return (
    <>
      <SkeletonTopbar title="Ventas" />
      <main className="flex-1 p-6 space-y-6" aria-busy="true">
        {/* Barra de filtro de período */}
        <Skeleton width="100%" height="5.25rem" />
        <SkeletonKpis />
        <SkeletonCards count={2} />
        <SkeletonTable title="Ventas del período" rows={10} />
      </main>
    </>
  )
}

import { SkeletonKpis, SkeletonTable, SkeletonTopbar } from '@/components/shell/PageSkeleton'

export default function LoadingConsignaciones() {
  return (
    <>
      <SkeletonTopbar title="Consignaciones" />
      <main className="flex-1 p-6 space-y-6" aria-busy="true">
        <SkeletonKpis />
        <SkeletonTable rows={8} />
      </main>
    </>
  )
}

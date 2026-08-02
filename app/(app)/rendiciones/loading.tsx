import { SkeletonKpis, SkeletonTable, SkeletonTopbar } from '@/components/shell/PageSkeleton'

export default function LoadingRendiciones() {
  return (
    <>
      <SkeletonTopbar title="Rendiciones" />
      <main className="flex-1 p-6 space-y-6" aria-busy="true">
        <SkeletonKpis />
        <SkeletonTable rows={8} />
      </main>
    </>
  )
}

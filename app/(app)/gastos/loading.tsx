import { SkeletonKpis, SkeletonTable, SkeletonTopbar } from '@/components/shell/PageSkeleton'

/** Dos paneles: presupuesto del mes y últimos gastos. */
export default function LoadingGastos() {
  return (
    <>
      <SkeletonTopbar title="Gastos" />
      <main className="flex-1 p-6 space-y-6" aria-busy="true">
        <SkeletonKpis />
        <SkeletonTable title="Presupuestos del mes" rows={6} />
        <SkeletonTable title="Últimos gastos registrados" rows={8} />
      </main>
    </>
  )
}

import { SkeletonTable, SkeletonTopbar } from '@/components/shell/PageSkeleton'

/** La page es solo `<ClientesTable>`, que trae su propio buscador. */
export default function LoadingClientes() {
  return (
    <>
      <SkeletonTopbar title="Clientes" />
      <main className="flex-1 p-6" aria-busy="true">
        <SkeletonTable rows={10} />
      </main>
    </>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Table, type Column } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { RevendedoraRow } from '@/lib/types/revendedoras'

export function RevendedorasView({ data, canCreate }: { data: RevendedoraRow[], canCreate: boolean }) {
  const router = useRouter()

  if (data.length === 0) {
    return (
      <EmptyState
        title="No hay revendedoras"
        description="Agregá tu primera revendedora para empezar."
        cta={{
          label: 'Nueva revendedora',
          onClick: () => router.push('/revendedoras/nuevo'),
        }}
      />
    )
  }

  const columns: Column<RevendedoraRow>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (r) => (
        <Link href={`/revendedoras/${r.id_revendedora}`} className="font-medium text-rosa hover:underline">
          {r.nombre} {r.apellido}
        </Link>
      ),
    },
    { key: 'email', label: 'Email', render: (r) => r.email || '-' },
    { key: 'telefono', label: 'Teléfono', render: (r) => r.telefono || '-' },
    {
      key: 'estado',
      label: 'Estado',
      render: (r) => (
        <Badge variant={r.estado === 'activa' ? 'success' : 'neutral'}>
          {r.estado === 'activa' ? 'Activa' : 'Baja'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => router.push('/revendedoras/nuevo')}>
            Nueva revendedora
          </Button>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table columns={columns} data={data} />
      </div>
    </div>
  )
}

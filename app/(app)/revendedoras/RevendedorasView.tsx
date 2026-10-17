'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Table, type Column } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { RevendedoraRow } from '@/lib/types/revendedoras'
import { Card } from '@/components/ui/Card'

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
        <Link href={`/revendedoras/${r.id_revendedora}`} className="font-medium text-ink underline decoration-line-2 underline-offset-2 hover:decoration-ink">
          {r.nombre} {r.apellido}
        </Link>
      ),
    },
    { key: 'email', label: 'Email', render: (r) => r.email || '-' },
    { key: 'telefono', label: 'Teléfono', render: (r) => r.telefono || '-' },
    {
      key: 'activo',
      label: 'Estado',
      render: (r) => (
        <Badge variant={r.activo ? 'success' : 'neutral'}>
          {r.activo ? 'Activa' : 'Baja'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push('/revendedoras/comisiones')}>
          Reglas de comisión
        </Button>
        {canCreate && (
          <Button onClick={() => router.push('/revendedoras/nuevo')}>
            Nueva revendedora
          </Button>
        )}
      </div>
      <Card padding="none" className="overflow-hidden">
        <Table columns={columns} data={data} />
      </Card>
    </div>
  )
}

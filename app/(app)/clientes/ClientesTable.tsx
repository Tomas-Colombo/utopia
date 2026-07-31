'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterBar } from '@/components/ui/FilterBar'
import { useToast } from '@/components/ui/Toast'
import { waMeLink } from '@/lib/utils/waMeLink'
import type { ClienteRow } from '@/lib/types/ventas'
import { toggleClienteActivoAction } from '../ventas/actions'

export function ClientesTable({
  rows,
  initialSearch,
}: {
  rows: ClienteRow[]
  initialSearch: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [q, setQ] = useState(initialSearch)
  const [pending, start] = useTransition()

  function apply() {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    const qs = params.toString()
    router.push(qs ? `/clientes?${qs}` : '/clientes')
  }

  function toggle(row: ClienteRow) {
    start(async () => {
      const res = await toggleClienteActivoAction({
        id: row.id_cliente,
        activo: !row.activo,
      })
      if (!res.ok) return toast.error('No se pudo actualizar', res.reason)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <FilterBar value={q} onChange={setQ} placeholder="Buscar por nombre, email o teléfono" />
        </div>
        <Button variant="secondary" onClick={apply}>Aplicar</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted">
          Sin resultados.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const wa = waMeLink(c.telefono)
                return (
                  <tr key={c.id_cliente} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <Link
                        href={`/clientes/${c.id_cliente}`}
                        className="font-medium hover:underline"
                      >
                        {c.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-pink-strong hover:underline"
                        >
                          {c.telefono} · WhatsApp
                        </a>
                      ) : (
                        c.telefono ?? <span className="text-muted-2">—</span>
                      )}
                      {c.email && <div className="text-muted">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.activo ? 'success' : 'neutral'}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggle(c)}
                        disabled={pending}
                      >
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

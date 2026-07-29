'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { toggleTenantModuloAction } from '../actions'

interface Mod {
  id: string
  codigo: string
  nombre: string
  habilitado: boolean
}

export function ModulosView({ initial }: { initial: Mod[] }) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [pending, start] = useTransition()

  function toggle(m: Mod) {
    const next = !m.habilitado
    start(async () => {
      const res = await toggleTenantModuloAction({
        idModulo: m.id,
        habilitado: next,
      })
      if (!res.ok) return toast.error('No se pudo actualizar', res.reason)
      toast.success(next ? 'Módulo habilitado' : 'Módulo deshabilitado')
      setRows((rs) =>
        rs.map((r) => (r.id === m.id ? { ...r, habilitado: next } : r)),
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
        Habilitá/deshabilitá módulos para este tenant. Los usuarios cuyo rol
        tenga permisos sobre un módulo <b>deshabilitado</b> no van a poder
        acceder — el guard falla con <code>module-disabled</code>.
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-border-2">
                <td className="px-4 py-3 font-medium">{m.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{m.codigo}</td>
                <td className="px-4 py-3">
                  <Badge variant={m.habilitado ? 'success' : 'neutral'}>
                    {m.habilitado ? 'Habilitado' : 'Deshabilitado'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant={m.habilitado ? 'ghost' : 'primary'}
                    onClick={() => toggle(m)}
                    disabled={pending}
                  >
                    {m.habilitado ? 'Deshabilitar' : 'Habilitar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

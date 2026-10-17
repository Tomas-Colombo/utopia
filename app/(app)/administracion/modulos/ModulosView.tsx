'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { toggleTenantModuloAction } from '../actions'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { TableFrame, DataTable, THead, TBody, Tr, Th, Td } from '@/components/ui/TableParts'

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
      if (!res.ok) return toast.error('No se pudo actualizar', mensajeDeError(res.reason))
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

      <TableFrame>
        <DataTable>
          <THead>
            <Th>Módulo</Th>
            <Th>Código</Th>
            <Th>Estado</Th>
            <Th></Th>
          </THead>
          <TBody>
            {rows.map((m) => (
              <Tr key={m.id}>
                <Td className="font-medium">{m.nombre}</Td>
                <Td className="font-mono text-xs text-muted">{m.codigo}</Td>
                <Td>
                  <Badge variant={m.habilitado ? 'success' : 'neutral'}>
                    {m.habilitado ? 'Habilitado' : 'Deshabilitado'}
                  </Badge>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant={m.habilitado ? 'ghost' : 'primary'}
                    onClick={() => toggle(m)}
                    disabled={pending}
                  >
                    {m.habilitado ? 'Deshabilitar' : 'Habilitar'}
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      </TableFrame>
    </div>
  )
}

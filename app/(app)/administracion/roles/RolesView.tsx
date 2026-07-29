'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import {
  CATALOGO_PERMISOS,
  MODULO_NOMBRE,
  type RolRow,
} from '@/lib/types/administracion'
import { deleteRolAction } from '../actions'

export function RolesView({ initial }: { initial: RolRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirmar, setConfirmar] = useState<RolRow | null>(null)

  function borrar() {
    if (!confirmar) return
    const r = confirmar
    setConfirmar(null)
    start(async () => {
      const res = await deleteRolAction({ idRol: r.id_rol })
      if (!res.ok) {
        return toast.error('No se pudo eliminar', traducir(res.reason))
      }
      toast.success('Rol eliminado')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {initial.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg mb-2">Sin roles</p>
          <p className="text-sm text-muted mb-4">
            Creá al menos un rol para asignarle permisos a tus usuarios.
          </p>
          <Link
            href="/administracion/roles/nuevo"
            className="inline-flex items-center rounded-md bg-accent-pink px-4 py-2 text-sm font-semibold text-sidebar"
          >
            Nuevo rol
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {initial.map((r) => (
            <div key={r.id_rol} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-display text-lg">{r.nombre}</h3>
                  <p className="text-xs text-muted mt-1">
                    Actualizado: {new Date(r.updated_at).toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/administracion/roles/${r.id_rol}`}>
                    <Button size="sm" variant="secondary">Editar</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmar(r)} disabled={pending}>
                    Eliminar
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1 text-xs">
                {Object.keys(CATALOGO_PERMISOS).map((mod) => {
                  const acciones = r.permisos?.[mod] ?? []
                  return (
                    <div key={mod} className="flex items-baseline gap-2">
                      <span className="font-mono text-muted w-32 shrink-0">
                        {MODULO_NOMBRE[mod] ?? mod}:
                      </span>
                      <span>
                        {acciones.length === 0 ? (
                          <span className="text-muted-2">—</span>
                        ) : (
                          acciones.join(', ')
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmar}
        title="Eliminar rol"
        description={
          confirmar
            ? `El rol "${confirmar.nombre}" se elimina definitivamente. Falla si algún usuario lo tiene asignado.`
            : ''
        }
        variant="danger"
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={borrar}
        onCancel={() => setConfirmar(null)}
      />
    </div>
  )
}

function traducir(reason: string): string {
  if (reason.startsWith('rol-en-uso')) return 'No se puede eliminar: hay usuarios con este rol asignado.'
  return reason
}

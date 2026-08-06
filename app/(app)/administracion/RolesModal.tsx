'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PermisosEditor } from '@/components/administracion/PermisosEditor'
import {
  CATALOGO_PERMISOS,
  MODULO_NOMBRE,
  type RolRow,
} from '@/lib/types/administracion'
import { createRolAction, deleteRolAction, updateRolAction } from './actions'

/** El modal alterna entre el listado y el formulario (alta o edición). No
 *  apilamos un segundo modal encima: es el mismo diálogo cambiando de vista. */
type Vista = { kind: 'lista' } | { kind: 'form'; rol: RolRow | null }

/**
 * Roles y permisos como pop-up desde la home de Administración. Antes era una
 * ruta propia (`/administracion/roles`) con dos páginas más para alta y
 * edición; se perdía el contexto de la home por un formulario de dos campos.
 *
 * Los datos llegan del server component (`listRoles()`), así que después de
 * cada mutación alcanza con `router.refresh()` para re-hidratar el listado.
 */
export function RolesModal({ roles }: { roles: RolRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [vista, setVista] = useState<Vista>({ kind: 'lista' })
  const [confirmar, setConfirmar] = useState<RolRow | null>(null)

  function cerrar() {
    if (pending) return
    setOpen(false)
    setConfirmar(null)
    setVista({ kind: 'lista' })
  }

  function borrar() {
    if (!confirmar) return
    const r = confirmar
    setConfirmar(null)
    start(async () => {
      const res = await deleteRolAction({ idRol: r.id_rol })
      if (!res.ok) return toast.error('No se pudo eliminar', traducir(res.reason))
      toast.success('Rol eliminado')
      router.refresh()
    })
  }

  const enForm = vista.kind === 'form'
  const editando = enForm && vista.rol !== null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-card p-5 text-left hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
      >
        <div className="text-sm text-muted">Roles</div>
        <div className="mt-1 font-display text-2xl">{roles.length}</div>
      </button>

      <Modal
        open={open}
        onClose={cerrar}
        size="xl"
        title={
          enForm
            ? editando
              ? `Editar rol: ${vista.rol!.nombre}`
              : 'Nuevo rol'
            : 'Roles y permisos'
        }
        footer={
          enForm ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setVista({ kind: 'lista' })}
                disabled={pending}
              >
                Volver
              </Button>
              <Button type="submit" form="rol-modal-form" disabled={pending}>
                {pending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear rol'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={cerrar} disabled={pending}>
                Cerrar
              </Button>
              <Button onClick={() => setVista({ kind: 'form', rol: null })} disabled={pending}>
                Nuevo rol
              </Button>
            </>
          )
        }
      >
        {enForm ? (
          <RolForm
            key={vista.rol?.id_rol ?? 'nuevo'}
            rol={vista.rol}
            pending={pending}
            onSubmit={(nombre, permisos) => {
              start(async () => {
                const res = vista.rol
                  ? await updateRolAction({ idRol: vista.rol.id_rol, nombre, permisos })
                  : await createRolAction({ nombre, permisos })
                if (!res.ok) {
                  return toast.error(
                    vista.rol ? 'No se pudo guardar' : 'No se pudo crear',
                    res.reason,
                  )
                }
                toast.success(vista.rol ? 'Rol actualizado' : 'Rol creado')
                setVista({ kind: 'lista' })
                router.refresh()
              })
            }}
          />
        ) : (
          <ListaRoles
            roles={roles}
            pending={pending}
            onNuevo={() => setVista({ kind: 'form', rol: null })}
            onEditar={(rol) => setVista({ kind: 'form', rol })}
            onEliminar={setConfirmar}
          />
        )}
      </Modal>

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
    </>
  )
}

function ListaRoles({
  roles,
  pending,
  onNuevo,
  onEditar,
  onEliminar,
}: {
  roles: RolRow[]
  pending: boolean
  onNuevo: () => void
  onEditar: (rol: RolRow) => void
  onEliminar: (rol: RolRow) => void
}) {
  if (roles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card-2 p-10 text-center">
        <p className="font-display text-lg mb-2">Sin roles</p>
        <p className="text-sm text-muted mb-4">
          Creá al menos un rol para asignarle permisos a tus usuarios.
        </p>
        <Button onClick={onNuevo}>Nuevo rol</Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {roles.map((r) => (
        <div key={r.id_rol} className="rounded-lg border border-border bg-card-2 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-display text-lg">{r.nombre}</h3>
              <p className="text-xs text-muted mt-1">
                Actualizado: {new Date(r.updated_at).toLocaleString('es-AR')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onEditar(r)} disabled={pending}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEliminar(r)} disabled={pending}>
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
  )
}

function RolForm({
  rol,
  pending,
  onSubmit,
}: {
  rol: RolRow | null
  pending: boolean
  onSubmit: (nombre: string, permisos: Record<string, string[]>) => void
}) {
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [permisos, setPermisos] = useState<Record<string, string[]>>(rol?.permisos ?? {})
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return setErr('Nombre muy corto')
    setErr(null)
    onSubmit(nombre.trim(), permisos)
  }

  return (
    <form id="rol-modal-form" onSubmit={submit} className="space-y-4">
      <Field htmlFor="rol-modal-nombre" label="Nombre del rol" required error={err ?? undefined}>
        <Input
          id="rol-modal-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          invalid={!!err}
          disabled={pending}
          placeholder='Ej. "Vendedor", "Encargado", "Administrador"'
        />
      </Field>

      <div>
        <h3 className="font-display text-lg mb-2">Permisos</h3>
        <PermisosEditor value={permisos} onChange={setPermisos} />
      </div>
    </form>
  )
}

function traducir(reason: string): string {
  if (reason.startsWith('rol-en-uso')) {
    return 'No se puede eliminar: hay usuarios con este rol asignado.'
  }
  return reason
}

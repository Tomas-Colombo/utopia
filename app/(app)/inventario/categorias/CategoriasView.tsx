'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Table, type Column } from '@/components/ui/Table'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { CategoriaRow } from '@/lib/types/inventario'
import {
  createCategoriaAction,
  toggleCategoriaActivaAction,
} from '../actions'

export function CategoriasView({ initial }: { initial: CategoriaRow[] }) {
  const [rows, setRows] = useState<CategoriaRow[]>(initial)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [errNombre, setErrNombre] = useState<string | null>(null)

  function reset() {
    setNombre('')
    setDescripcion('')
    setErrNombre(null)
  }

  function submit() {
    if (nombre.trim().length < 2) {
      setErrNombre('Mínimo 2 caracteres')
      return
    }
    startTransition(async () => {
      const res = await createCategoriaAction({
        nombre,
        descripcion: descripcion || null,
      })
      if (!res.ok) {
        toast.error('No se pudo crear', res.reason)
        return
      }
      toast.success('Categoría creada')
      // Optimistic: agrego una fila temporal; el revalidatePath en el server la
      // reemplazará en el próximo render de datos frescos.
      const now = new Date().toISOString()
      setRows((r) => [
        ...r,
        {
          id_categoria: res.data?.id ?? crypto.randomUUID(),
          id_tenant: '',
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          activa: true,
          created_at: now,
          updated_at: now,
        } as CategoriaRow,
      ])
      setOpen(false)
      reset()
    })
  }

  function toggle(row: CategoriaRow) {
    startTransition(async () => {
      const res = await toggleCategoriaActivaAction({
        id: row.id_categoria,
        activa: !row.activa,
      })
      if (!res.ok) return toast.error('No se pudo actualizar', res.reason)
      setRows((rs) =>
        rs.map((r) => (r.id_categoria === row.id_categoria ? { ...r, activa: !r.activa } : r)),
      )
    })
  }

  const columns: Column<CategoriaRow>[] = [
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (r) => r.descripcion || <span className="text-muted-2">—</span>,
    },
    {
      key: 'activa',
      label: 'Estado',
      render: (r) => (
        <Badge variant={r.activa ? 'success' : 'neutral'}>
          {r.activa ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={() => toggle(r)} disabled={pending}>
          {r.activa ? 'Desactivar' : 'Activar'}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Nueva categoría</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin categorías todavía"
          description="Creá la primera categoría para clasificar tus productos."
          cta={{ label: 'Nueva categoría', onClick: () => setOpen(true) }}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table
            columns={columns}
            data={rows}
            getRowId={(r) => r.id_categoria}
          />
        </div>
      )}

      <Modal
        open={open}
        title="Nueva categoría"
        onClose={() => {
          setOpen(false)
          reset()
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Guardando…' : 'Crear'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field htmlFor="cat-nombre" label="Nombre" required error={errNombre ?? undefined}>
            <Input
              id="cat-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              invalid={!!errNombre}
            />
          </Field>
          <Field htmlFor="cat-desc" label="Descripción">
            <Textarea
              id="cat-desc"
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

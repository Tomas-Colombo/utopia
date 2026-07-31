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
import { TallesEditor } from '@/components/inventario/TallesEditor'
import type { CategoriaRow } from '@/lib/types/inventario'
import {
  createCategoriaAction,
  toggleCategoriaActivaAction,
  updateCategoriaAction,
} from '../actions'

export function CategoriasView({ initial }: { initial: CategoriaRow[] }) {
  const [rows, setRows] = useState<CategoriaRow[]>(initial)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [talles, setTalles] = useState<string[]>([])
  const [errNombre, setErrNombre] = useState<string | null>(null)

  function reset() {
    setNombre('')
    setDescripcion('')
    setTalles([])
    setErrNombre(null)
    setEditId(null)
  }

  function abrirNueva() {
    reset()
    setOpen(true)
  }

  function abrirEditar(row: CategoriaRow) {
    setEditId(row.id_categoria)
    setNombre(row.nombre)
    setDescripcion(row.descripcion ?? '')
    setTalles(row.talles ?? [])
    setErrNombre(null)
    setOpen(true)
  }

  function cerrar() {
    setOpen(false)
    reset()
  }

  function submit() {
    if (nombre.trim().length < 2) {
      setErrNombre('Mínimo 2 caracteres')
      return
    }
    startTransition(async () => {
      if (editId) {
        const res = await updateCategoriaAction(editId, {
          nombre,
          descripcion: descripcion || null,
          talles,
        })
        if (!res.ok) return toast.error('No se pudo guardar', res.reason)
        toast.success('Categoría actualizada')
        setRows((r) =>
          r.map((c) =>
            c.id_categoria === editId
              ? { ...c, nombre: nombre.trim(), descripcion: descripcion.trim() || null, talles }
              : c,
          ),
        )
        cerrar()
        return
      }

      const res = await createCategoriaAction({
        nombre,
        descripcion: descripcion || null,
        talles,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      toast.success('Categoría creada')
      const now = new Date().toISOString()
      setRows((r) => [
        ...r,
        {
          id_categoria: res.data?.id ?? crypto.randomUUID(),
          id_tenant: '',
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          activa: true,
          talles,
          created_at: now,
          updated_at: now,
        } as CategoriaRow,
      ])
      cerrar()
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
      key: 'talles',
      label: 'Talles',
      render: (r) =>
        r.talles && r.talles.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.talles.map((t) => (
              <span key={t} className="rounded-full border border-border bg-card-2 px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-2">—</span>
        ),
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
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => abrirEditar(r)} disabled={pending}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggle(r)} disabled={pending}>
            {r.activa ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={abrirNueva}>Nueva categoría</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin categorías todavía"
          description="Creá la primera categoría para clasificar tus productos."
          cta={{ label: 'Nueva categoría', onClick: abrirNueva }}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table columns={columns} data={rows} getRowId={(r) => r.id_categoria} />
        </div>
      )}

      <Modal
        open={open}
        title={editId ? 'Editar categoría' : 'Nueva categoría'}
        onClose={cerrar}
        footer={
          <>
            <Button variant="secondary" onClick={cerrar} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Guardando…' : editId ? 'Guardar' : 'Crear'}
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
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Field>
          <Field htmlFor="cat-talles" label="Talles" hint="Los talles/medidas de esta categoría (ej: S, M, L). Se usan al cargar productos e ingresos.">
            <TallesEditor value={talles} onChange={setTalles} disabled={pending} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

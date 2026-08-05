'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { CategoriaRow, ProductoRow } from '@/lib/types/inventario'
import { updateProductoAction } from '../../actions'

export function EditarProductoForm({
  producto,
  categorias,
}: {
  producto: ProductoRow
  categorias: CategoriaRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState(producto.nombre)
  const [idCategoria, setIdCategoria] = useState(producto.id_categoria)
  const [stockMinimo, setStockMinimo] = useState(String(producto.stock_minimo))
  const [descripcion, setDescripcion] = useState(producto.descripcion ?? '')
  const [activo, setActivo] = useState(producto.activo)

  const [errors, setErrors] = useState<{ nombre?: string; categoria?: string }>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (nombre.trim().length < 2) errs.nombre = 'Mínimo 2 caracteres'
    if (!idCategoria) errs.categoria = 'Elegí una categoría'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    start(async () => {
      const res = await updateProductoAction(producto.id_producto, {
        nombre: nombre.trim(),
        id_categoria: idCategoria,
        stock_minimo: Number(stockMinimo || 0),
        descripcion: descripcion.trim() || null,
        activo,
      })
      if (!res.ok) return toast.error('No se pudo guardar', res.reason)
      toast.success('Producto actualizado')
      router.push('/inventario')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field htmlFor="prod-nombre" label="Nombre" required error={errors.nombre}>
        <Input
          id="prod-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          invalid={!!errors.nombre}
        />
      </Field>

      <Field htmlFor="prod-cat" label="Categoría" required error={errors.categoria}>
        <select
          id="prod-cat"
          value={idCategoria}
          onChange={(e) => setIdCategoria(e.target.value)}
          aria-invalid={!!errors.categoria || undefined}
          className="w-full"
        >
          {categorias.map((c) => (
            <option key={c.id_categoria} value={c.id_categoria}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field htmlFor="prod-stock" label="Stock mínimo">
        <NumberInput
          id="prod-stock"
          min={0}
          value={stockMinimo}
          onChange={(e) => setStockMinimo(e.target.value)}
        />
      </Field>

      <Field htmlFor="prod-desc" label="Descripción">
        <Textarea
          id="prod-desc"
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="h-4 w-4 rounded border-border text-accent-pink focus:ring-accent-pink"
        />
        Producto activo
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}

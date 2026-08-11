'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { CategoriaRow, ProductoRow } from '@/lib/types/inventario'
import { updateProductoAction } from '../actions'

/** Campos mínimos que la UI toca para editar un producto. Toma `ProductoRow`
 *  o cualquier subtipo (p. ej. `ProductoConDetalle` de la tabla). */
type ProductoEditable = Pick<
  ProductoRow,
  'id_producto' | 'nombre' | 'id_categoria' | 'stock_minimo' | 'descripcion' | 'activo'
>

/**
 * Edición inline del producto en un modal — antes vivía en una página propia
 * pero son cinco campos y el usuario prefiere no perder el contexto del listado
 * o de la ficha. Al guardar, refrescamos el árbol para que el listado y la
 * ficha se re-hidraten con los nuevos datos.
 */
export function EditarProductoModal({
  open,
  producto,
  categorias,
  onClose,
}: {
  open: boolean
  producto: ProductoEditable | null
  categorias: CategoriaRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [stockMinimo, setStockMinimo] = useState('0')
  const [descripcion, setDescripcion] = useState('')
  const [activo, setActivo] = useState(true)
  const [errors, setErrors] = useState<{ nombre?: string; categoria?: string }>({})

  // Al (re)abrir el modal con un producto distinto, resembramos el form.
  //
  // Se ajusta durante el render y no en un efecto: así el modal ya aparece con
  // los datos del producto correcto. Con un efecto, el primer frame mostraba
  // los valores del producto anterior y recién después se corregía.
  //
  // La clave incluye el estado `open` a propósito: al cerrar vuelve a `null`,
  // de modo que reabrir el MISMO producto también resiembra y descarta los
  // cambios que el usuario dejó sin guardar.
  const seedKey = open && producto ? producto.id_producto : null
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (seedKey !== seededFor) {
    setSeededFor(seedKey)
    if (open && producto) {
      setNombre(producto.nombre)
      setIdCategoria(producto.id_categoria)
      setStockMinimo(String(producto.stock_minimo))
      setDescripcion(producto.descripcion ?? '')
      setActivo(producto.activo)
      setErrors({})
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!producto) return
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
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => (pending ? null : onClose())}
      title={producto ? `Editar: ${producto.nombre}` : 'Editar producto'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="editar-producto-modal-form" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <form id="editar-producto-modal-form" onSubmit={submit} className="space-y-4">
        <Field htmlFor="epm-nombre" label="Nombre" required error={errors.nombre}>
          <Input
            id="epm-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            invalid={!!errors.nombre}
          />
        </Field>

        <Field htmlFor="epm-cat" label="Categoría" required error={errors.categoria}>
          <select
            id="epm-cat"
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

        <Field htmlFor="epm-stock" label="Stock mínimo">
          <NumberInput
            id="epm-stock"
            min={0}
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
          />
        </Field>

        <Field htmlFor="epm-desc" label="Descripción">
          <Textarea
            id="epm-desc"
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
      </form>
    </Modal>
  )
}

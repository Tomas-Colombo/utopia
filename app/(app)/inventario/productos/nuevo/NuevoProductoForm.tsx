'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { CategoriaRow } from '@/lib/types/inventario'
import { createProductoAction } from '../../actions'

export function NuevoProductoForm({ categorias }: { categorias: CategoriaRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [sku, setSku] = useState('')
  const [idCategoria, setIdCategoria] = useState(categorias[0]?.id_categoria ?? '')
  const [stockMinimo, setStockMinimo] = useState('0')
  const [descripcion, setDescripcion] = useState('')
  const [costoInicial, setCostoInicial] = useState('')
  const [moneda, setMoneda] = useState('ARS')

  const [errors, setErrors] = useState<{ nombre?: string; categoria?: string }>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (nombre.trim().length < 2) errs.nombre = 'Mínimo 2 caracteres'
    if (!idCategoria) errs.categoria = 'Elegí una categoría'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    start(async () => {
      const res = await createProductoAction({
        idCategoria,
        nombre,
        sku: sku || null,
        stockMinimo: Number(stockMinimo || 0),
        descripcion: descripcion || null,
        costoInicial: costoInicial ? Number(costoInicial) : null,
        moneda,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      toast.success('Producto creado')
      router.push('/inventario/productos')
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

      <div className="grid grid-cols-2 gap-4">
        <Field htmlFor="prod-sku" label="SKU">
          <Input id="prod-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Field htmlFor="prod-cat" label="Categoría" required error={errors.categoria}>
          <select
            id="prod-cat"
            value={idCategoria}
            onChange={(e) => setIdCategoria(e.target.value)}
            aria-invalid={!!errors.categoria || undefined}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            {categorias.map((c) => (
              <option key={c.id_categoria} value={c.id_categoria}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field htmlFor="prod-stock" label="Stock mínimo">
          <NumberInput
            id="prod-stock"
            min={0}
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
          />
        </Field>
        <Field htmlFor="prod-costo" label="Costo inicial" hint="Se historiza; se puede cambiar luego">
          <div className="flex gap-2">
            <NumberInput
              id="prod-costo"
              min={0}
              step="0.01"
              value={costoInicial}
              onChange={(e) => setCostoInicial(e.target.value)}
              className="flex-1"
            />
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              aria-label="Moneda"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </Field>
      </div>

      <Field htmlFor="prod-desc" label="Descripción">
        <Textarea
          id="prod-desc"
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}

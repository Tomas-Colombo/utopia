'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { StockTalleLoader, type LineaTalle } from '@/components/inventario/StockTalleLoader'
import type { CategoriaRow, ProductoConDetalle, ProveedorRow } from '@/lib/types/inventario'
import { buscarMatchNombre, indexarPorNombre } from '@/lib/inventario/producto-match'
import { createProductoAction } from '../../actions'

export function NuevoProductoForm({
  categorias,
  productos,
  proveedores,
}: {
  categorias: CategoriaRow[]
  productos: ProductoConDetalle[]
  proveedores: ProveedorRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [nombre, setNombre] = useState('')
  const [idCategoria, setIdCategoria] = useState(categorias[0]?.id_categoria ?? '')
  const [idProveedor, setIdProveedor] = useState('')
  const [stockMinimo, setStockMinimo] = useState('0')
  const [descripcion, setDescripcion] = useState('')
  const [costoInicial, setCostoInicial] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [stock, setStock] = useState<LineaTalle[]>([])

  const [errors, setErrors] = useState<{ nombre?: string; categoria?: string }>({})

  // Talles disponibles según la categoría elegida.
  const tallesCategoria = categorias.find((c) => c.id_categoria === idCategoria)?.talles ?? []

  // Índice nombre-normalizado → producto existente, para bloquear duplicados.
  const indexNombres = useMemo(() => indexarPorNombre(productos), [productos])
  const nombreDuplicado = buscarMatchNombre(indexNombres, nombre)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (nombre.trim().length < 2) errs.nombre = 'Mínimo 2 caracteres'
    else if (nombreDuplicado) errs.nombre = 'Ya existe un producto con ese nombre'
    if (!idCategoria) errs.categoria = 'Elegí una categoría'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    start(async () => {
      const res = await createProductoAction({
        idCategoria,
        nombre,
        sku: null, // el SKU se autogenera en la DB (sp_gen_sku)
        stockMinimo: Number(stockMinimo || 0),
        descripcion: descripcion || null,
        costoInicial: costoInicial ? Number(costoInicial) : null,
        moneda,
        idProveedor: idProveedor || null,
        stock,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      const items = res.data?.itemsCreados ?? 0
      toast.success('Producto creado', items > 0 ? `${items} ítem(s) de stock generados` : undefined)
      router.push('/inventario')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        htmlFor="prod-nombre"
        label="Nombre"
        required
        error={errors.nombre ?? (nombreDuplicado ? 'Ya existe un producto con ese nombre' : undefined)}
      >
        <Input
          id="prod-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          invalid={!!errors.nombre || !!nombreDuplicado}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field htmlFor="prod-cat" label="Categoría" required error={errors.categoria}>
          <select
            id="prod-cat"
            value={idCategoria}
            onChange={(e) => {
              setIdCategoria(e.target.value)
              setStock([]) // los talles son propios de cada categoría
            }}
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
        <div className="flex items-end">
          <p className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
            El <b>SKU</b> se genera automáticamente al crear (ej: <span className="font-mono">REM-0007</span>).
            No hace falta cargarlo a mano.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      {proveedores.length > 0 && (
        <Field
          htmlFor="prod-proveedor"
          label="Proveedor (opcional)"
          hint="Si elegís uno, el stock inicial se registra como un ingreso de compra a ese proveedor."
        >
          <select
            id="prod-proveedor"
            value={idProveedor}
            onChange={(e) => setIdProveedor(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <option value="">Sin proveedor (alta directa)</option>
            {proveedores.map((p) => (
              <option key={p.id_proveedor} value={p.id_proveedor}>
                {p.nombre} · {p.tipo}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        htmlFor="prod-stock-inicial"
        label="Stock inicial (opcional)"
        hint={
          tallesCategoria.length > 0
            ? 'Cargá cuántas unidades de cada talle tenés (ej: 2 S, 2 XL). Genera los ítems físicos con QR.'
            : 'Esta categoría no tiene talles. Podés cargar unidades sin talle, o definí talles en la categoría.'
        }
      >
        <StockTalleLoader talles={tallesCategoria} value={stock} onChange={setStock} disabled={pending} />
      </Field>

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
        <Button type="submit" disabled={pending || !!nombreDuplicado}>
          {pending ? 'Guardando…' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}

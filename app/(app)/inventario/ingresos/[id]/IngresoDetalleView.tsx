'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/ui/NumberInput'
import { useToast } from '@/components/ui/Toast'
import type {
  IngresoMercaderiaDetalleRow,
  IngresoMercaderiaRow,
  ProductoConDetalle,
  ProveedorRow,
} from '@/lib/types/inventario'
import {
  addIngresoDetalleAction,
  confirmarIngresoAction,
  removeIngresoDetalleAction,
} from '../../actions'

type Ingreso = IngresoMercaderiaRow & {
  proveedor: Pick<ProveedorRow, 'id_proveedor' | 'nombre' | 'telefono'> | null
  detalle: IngresoMercaderiaDetalleRow[]
}

export function IngresoDetalleView({
  ingreso,
  productos,
}: {
  ingreso: Ingreso
  productos: ProductoConDetalle[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [detalles, setDetalles] = useState(ingreso.detalle)
  const [idProducto, setIdProducto] = useState(productos[0]?.id_producto ?? '')
  const [cantidad, setCantidad] = useState('1')
  const [costoUnitario, setCostoUnitario] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const totalCantidad = detalles.reduce((a, d) => a + d.cantidad, 0)
  const totalCosto = detalles.reduce((a, d) => a + d.cantidad * d.costo_unitario, 0)
  const readonly = ingreso.confirmado

  function addLinea(e: React.FormEvent) {
    e.preventDefault()
    if (!idProducto) return toast.error('Falta producto')
    const cant = Number(cantidad || 0)
    const costo = Number(costoUnitario || 0)
    if (cant <= 0) return toast.error('Cantidad inválida')
    if (costo < 0) return toast.error('Costo inválido')

    start(async () => {
      const res = await addIngresoDetalleAction({
        idIngreso: ingreso.id_ingreso,
        idProducto,
        cantidad: cant,
        costoUnitario: costo,
      })
      if (!res.ok) return toast.error('No se pudo agregar', res.reason)
      // Optimistic: agrego una fila; router.refresh() traerá la real.
      setDetalles((d) => [
        ...d,
        {
          id_detalle: res.data!.id,
          id_tenant: ingreso.id_tenant,
          id_ingreso: ingreso.id_ingreso,
          id_producto: idProducto,
          cantidad: cant,
          costo_unitario: costo,
          created_at: new Date().toISOString(),
        },
      ])
      setCantidad('1')
      setCostoUnitario('')
      router.refresh()
    })
  }

  function removeLinea(idDetalle: string) {
    start(async () => {
      const res = await removeIngresoDetalleAction({
        idIngreso: ingreso.id_ingreso,
        idDetalle,
      })
      if (!res.ok) return toast.error('No se pudo eliminar', res.reason)
      setDetalles((d) => d.filter((x) => x.id_detalle !== idDetalle))
    })
  }

  function confirmar() {
    setConfirmOpen(false)
    start(async () => {
      const res = await confirmarIngresoAction({ idIngreso: ingreso.id_ingreso })
      if (!res.ok) return toast.error('No se pudo confirmar', res.reason)
      toast.success(`Ingreso confirmado`, `Se generaron ${res.data?.itemsGenerados ?? 0} ítems con QR único`)
      router.refresh()
    })
  }

  const productoNombre = (id: string) =>
    productos.find((p) => p.id_producto === id)?.nombre ?? id

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs uppercase text-muted font-mono">Proveedor</div>
          <div className="mt-1">{ingreso.proveedor?.nombre ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted font-mono">Tipo</div>
          <div className="mt-1 capitalize">{ingreso.tipo_ingreso}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted font-mono">Remito</div>
          <div className="mt-1 font-mono">{ingreso.numero_remito ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted font-mono">Fecha</div>
          <div className="mt-1">{new Date(ingreso.fecha).toLocaleString('es-AR')}</div>
        </div>
      </div>

      {/* Líneas */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3 text-right">Costo unit.</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
              {!readonly && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody>
            {detalles.length === 0 ? (
              <tr>
                <td colSpan={readonly ? 4 : 5} className="px-4 py-6 text-center text-muted">
                  Sin líneas. Agregá al menos una antes de confirmar.
                </td>
              </tr>
            ) : (
              detalles.map((d) => (
                <tr key={d.id_detalle} className="border-b border-border-2">
                  <td className="px-4 py-3">{productoNombre(d.id_producto)}</td>
                  <td className="px-4 py-3 text-right font-mono">{d.cantidad}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    $ {Number(d.costo_unitario).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    $ {(d.cantidad * d.costo_unitario).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  {!readonly && (
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeLinea(d.id_detalle)} disabled={pending}>
                        Quitar
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-card-2">
              <td className="px-4 py-3 font-semibold">Total</td>
              <td className="px-4 py-3 text-right font-mono font-semibold">{totalCantidad}</td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-right font-mono font-semibold">
                $ {totalCosto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </td>
              {!readonly && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add line form */}
      {!readonly && (
        <form
          onSubmit={addLinea}
          className="rounded-lg border border-border bg-card p-4 grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end"
        >
          <Field htmlFor="l-prod" label="Producto">
            <select
              id="l-prod"
              value={idProducto}
              onChange={(e) => setIdProducto(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              {productos.map((p) => (
                <option key={p.id_producto} value={p.id_producto}>
                  {p.nombre}
                  {p.sku ? ` · ${p.sku}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="l-cant" label="Cantidad">
            <NumberInput
              id="l-cant"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </Field>
          <Field htmlFor="l-costo" label="Costo unitario">
            <NumberInput
              id="l-costo"
              min={0}
              step="0.01"
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Agregando…' : 'Agregar línea'}
          </Button>
        </form>
      )}

      {/* Confirmar */}
      {!readonly && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted">
            Al confirmar se generan {totalCantidad} ítem(s) con QR único y estado <b>disponible</b>.
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={pending || detalles.length === 0}
          >
            Confirmar ingreso
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar ingreso"
        description={`Se van a generar ${totalCantidad} ítems físicos con QR único. Esta acción no se puede deshacer.`}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        onConfirm={confirmar}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

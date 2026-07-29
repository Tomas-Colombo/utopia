'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { PreviewLineaRendicion } from '@/lib/types/rendiciones'
import {
  excluirDetalleAction,
  generarRendicionAction,
  reincluirDetalleAction,
} from '../actions'

interface Prov { id: string; nombre: string; tipo: string }

/**
 * Vista de "Generar rendición" (Ejecucion §L227/L228):
 *  1. Elegir proveedor → URL param `?prov=` → server re-renderea con `previewRendicion`.
 *  2. Ver líneas pendientes (todas las detalle_venta con id_rendicion IS NULL
 *     + monto_prov>0 + excluida_rendicion=false + venta no anulada).
 *  3. Excluir líneas manualmente (persiste excluida_rendicion=true; NUNCA
 *     vuelve a aparecer en futuras rendiciones).
 *  4. Confirmar → sp_generar_rendicion en una tx atómica.
 */
export function NuevaRendicionView({
  proveedores,
  idProvSeleccionado,
  lineas,
}: {
  proveedores: Prov[]
  idProvSeleccionado: string
  lineas: PreviewLineaRendicion[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  // Set local para tracking optimista de exclusiones (no bloquea al usuario
  // por round-trip). El estado real vive en DB: si excluye una línea el
  // server-render próximo ya no la va a traer.
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())

  const [obs, setObs] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const visibles = lineas.filter((l) => !excluidos.has(l.id_detalle_venta))
  const total = useMemo(
    () => visibles.reduce((a, l) => a + Number(l.monto_proveedor), 0),
    [visibles],
  )

  function elegirProveedor(id: string) {
    router.push(id ? `/rendiciones/nueva?prov=${id}` : '/rendiciones/nueva')
  }

  function excluir(idDetalle: string) {
    start(async () => {
      const res = await excluirDetalleAction({ idDetalle })
      if (!res.ok) return toast.error('No se pudo excluir', res.reason)
      setExcluidos((s) => new Set(s).add(idDetalle))
      toast.info('Línea excluida', 'No aparecerá en futuras rendiciones')
    })
  }

  function reincluir(idDetalle: string) {
    start(async () => {
      const res = await reincluirDetalleAction({ idDetalle })
      if (!res.ok) return toast.error('No se pudo reincluir', res.reason)
      setExcluidos((s) => {
        const n = new Set(s)
        n.delete(idDetalle)
        return n
      })
    })
  }

  function confirmar() {
    setConfirmOpen(false)
    start(async () => {
      const res = await generarRendicionAction({
        idProveedor: idProvSeleccionado,
        observaciones: obs || null,
      })
      if (!res.ok) return toast.error('No se pudo generar', traducir(res.reason))
      toast.success('Rendición generada', `Total $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
      router.push(`/rendiciones/${res.data!.id}`)
      router.refresh()
    })
  }

  const puedeGenerar = !!idProvSeleccionado && visibles.length > 0 && !pending

  return (
    <div className="space-y-6">
      {/* Paso 1: seleccionar proveedor */}
      <div className="rounded-lg border border-border bg-card p-4">
        <Field htmlFor="r-prov" label="Proveedor" required>
          <select
            id="r-prov"
            value={idProvSeleccionado}
            onChange={(e) => elegirProveedor(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <option value="">— Elegí un proveedor —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {p.tipo}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Paso 2: preview de líneas */}
      {!idProvSeleccionado ? (
        <div className="rounded-md border border-border bg-card-2 p-4 text-sm text-muted">
          Elegí un proveedor para ver las ventas pendientes de rendirle.
        </div>
      ) : lineas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-lg mb-2">No hay líneas pendientes</p>
          <p className="text-sm text-muted">
            Este proveedor no tiene ventas de consignación con saldo pendiente
            de rendir. Todas las ventas anteriores ya fueron rendidas o
            excluidas manualmente.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <h3 className="font-display text-lg">Ventas pendientes de rendir</h3>
              <span className="text-sm text-muted">
                {visibles.length} de {lineas.length} líneas seleccionadas
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">QR</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  <th className="px-4 py-3 text-right">Monto proveedor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const excluida = excluidos.has(l.id_detalle_venta)
                  return (
                    <tr
                      key={l.id_detalle_venta}
                      className={`border-b border-border-2 ${
                        excluida ? 'opacity-40' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        {new Date(l.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{l.producto_nombre}</div>
                        {l.producto_sku && (
                          <div className="text-xs font-mono text-muted">{l.producto_sku}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{l.qr_code}</td>
                      <td className="px-4 py-3 text-xs">
                        {l.cliente_nombre ?? <span className="text-muted-2">Mostrador</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted">
                        $ {Number(l.precio_venta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        $ {Number(l.monto_proveedor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {excluida ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => reincluir(l.id_detalle_venta)}
                            disabled={pending}
                          >
                            Reincluir
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => excluir(l.id_detalle_venta)}
                            disabled={pending}
                          >
                            Excluir
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-card-2">
                  <td colSpan={5} className="px-4 py-3 font-semibold">
                    Total a rendir ({visibles.length} líneas)
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    $ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
            <b>Excluir</b> marca la línea con <code>excluida_rendicion=true</code>{' '}
            en la base de datos: <b>nunca más</b> vuelve a aparecer en una rendición
            futura. Usalo cuando decidís no rendirle una prenda de consignación
            al proveedor. Se puede reincluir mientras no confirmes esta rendición.
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Field htmlFor="r-obs" label="Observaciones">
                <Textarea
                  id="r-obs"
                  rows={2}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ej. Rendición mensual noviembre"
                />
              </Field>
            </div>
            <Button
              size="lg"
              onClick={() => setConfirmOpen(true)}
              disabled={!puedeGenerar}
            >
              {pending ? 'Generando…' : `Confirmar rendición · $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Generar rendición"
        description={`Se van a marcar ${visibles.length} línea(s) como rendidas por un total de $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, generar"
        cancelLabel="Cancelar"
        onConfirm={confirmar}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function traducir(reason: string): string {
  if (reason === 'sin-lineas-pendientes')
    return 'No hay líneas pendientes de rendir para este proveedor en este momento.'
  if (reason === 'no-tenant') return 'Sesión sin tenant.'
  return reason
}

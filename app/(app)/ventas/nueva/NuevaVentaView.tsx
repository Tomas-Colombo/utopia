'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { FORMA_PAGO_LABEL, type FormaPago } from '@/lib/types/precios'
import type { LineaCarrito } from '@/lib/types/ventas'
import { registrarVentaAction } from '../actions'

interface ClienteOption { id: string; nombre: string; telefono: string | null }
interface ReservaOption {
  id: string
  fecha: string
  fecha_vencimiento: string
  cliente_nombre: string | null
  items_count: number
}

/**
 * Carrito de venta con escaneo QR + búsqueda manual.
 *
 * IMPORTANTE: el precio final ES calculado en el server (endpoint
 * /api/ventas/lookup-item que llama sp_calcular_precio_venta_snapshot).
 * La UI solo muestra — el operador NO puede editar precio arbitrariamente.
 *
 * La confirmación de venta llama sp_registrar_venta que reevalúa TODO
 * (precio, reserva, estado de item) en la misma tx atómica. Si algo
 * cambió entre "agregar al carrito" y "confirmar" (ej. otro operador
 * vendió el mismo item), la tx falla y el usuario ve el error.
 */
export function NuevaVentaView({
  clientes,
  reservasActivas,
  idReservaPreseleccionada,
}: {
  clientes: ClienteOption[]
  reservasActivas: ReservaOption[]
  idReservaPreseleccionada: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo')
  const [idCliente, setIdCliente] = useState<string>('')
  const [idReserva, setIdReserva] = useState<string>(idReservaPreseleccionada ?? '')
  const [observaciones, setObservaciones] = useState('')

  const [qrInput, setQrInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)

  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  const [confirmarOpen, setConfirmarOpen] = useState(false)

  // Cuando cambia forma_pago o reserva ⇒ recalculo precios de cada línea.
  useEffect(() => {
    if (lineas.length === 0) return
    let cancelled = false
    ;(async () => {
      const refreshed: LineaCarrito[] = []
      for (const l of lineas) {
        try {
          const r = await fetch(
            `/api/ventas/lookup-item?qr=${encodeURIComponent(l.qr_code)}&forma_pago=${formaPago}${
              idReserva ? `&id_reserva=${encodeURIComponent(idReserva)}` : ''
            }`,
          )
          const data = await r.json()
          if (data.ok) refreshed.push(data.linea as LineaCarrito)
          else refreshed.push(l) // dejo la vieja si falla
        } catch {
          refreshed.push(l)
        }
      }
      if (!cancelled) setLineas(refreshed)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPago, idReserva])

  const total = useMemo(
    () => lineas.reduce((a, l) => a + (l.precio_final ?? 0), 0),
    [lineas],
  )

  async function agregarLinea(e?: React.FormEvent) {
    e?.preventDefault()
    const qr = qrInput.trim()
    if (!qr) return
    if (lineas.some((l) => l.qr_code === qr)) {
      setErrorBusqueda('Ese ítem ya está en el carrito')
      return
    }
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const r = await fetch(
        `/api/ventas/lookup-item?qr=${encodeURIComponent(qr)}&forma_pago=${formaPago}${
          idReserva ? `&id_reserva=${encodeURIComponent(idReserva)}` : ''
        }`,
      )
      const data = await r.json()
      if (!data.ok) {
        setErrorBusqueda(traducirReason(data.reason, data))
        return
      }
      setLineas((ls) => [...ls, data.linea as LineaCarrito])
      setQrInput('')
    } catch (e) {
      setErrorBusqueda((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  function quitarLinea(qr: string) {
    setLineas((ls) => ls.filter((l) => l.qr_code !== qr))
  }

  function confirmar() {
    setConfirmarOpen(false)
    start(async () => {
      const res = await registrarVentaAction({
        lineas: lineas.map((l) => ({ id_item: l.id_item })),
        formaPago,
        idCliente: idCliente || null,
        idReserva: idReserva || null,
        observaciones: observaciones || null,
      })
      if (!res.ok) return toast.error('No se pudo registrar la venta', traducirReason(res.reason))
      toast.success('Venta registrada', `Total $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
      router.push(`/ventas/${res.data!.id}`)
      router.refresh()
    })
  }

  const clientesFiltrados = idReserva
    ? clientes.filter((c) => {
        const r = reservasActivas.find((x) => x.id === idReserva)
        return !r?.cliente_nombre || r.cliente_nombre === c.nombre
      })
    : clientes

  const puedeConfirmar = lineas.length > 0 && !pending

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* Carrito */}
      <section className="space-y-4">
        <form
          onSubmit={agregarLinea}
          className="rounded-lg border border-border bg-card p-4"
        >
          <Field
            htmlFor="qr-input"
            label="Escanear o tipear QR"
            error={errorBusqueda ?? undefined}
            hint="Enter para agregar al carrito"
          >
            <div className="flex gap-2">
              <Input
                id="qr-input"
                autoFocus
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Código QR del ítem"
                invalid={!!errorBusqueda}
                disabled={buscando}
              />
              <Button type="submit" disabled={buscando || !qrInput.trim()}>
                {buscando ? 'Buscando…' : 'Agregar'}
              </Button>
            </div>
          </Field>
        </form>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">QR</th>
                <th className="px-4 py-3 text-right">Precio lista</th>
                <th className="px-4 py-3 text-right">Precio final</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Escaneá el primer ítem para empezar la venta.
                  </td>
                </tr>
              ) : (
                lineas.map((l) => (
                  <tr key={l.qr_code} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.producto_nombre}</div>
                      <div className="text-xs text-muted">
                        {l.sku ?? '—'} · {l.categoria_nombre ?? '—'}
                      </div>
                      {l.advertencia && (
                        <div className="mt-1 text-xs text-terracota">{l.advertencia}</div>
                      )}
                      {l.desactualizado && (
                        <Badge variant="warning">Precio desactualizado</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{l.qr_code}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {l.precio_lista != null
                        ? `$ ${l.precio_lista.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {l.precio_final != null
                        ? `$ ${l.precio_final.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => quitarLinea(l.qr_code)}
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-card-2">
                <td colSpan={3} className="px-4 py-3 font-semibold">
                  Total ({lineas.length} ítem{lineas.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  $ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Panel lateral */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <Field htmlFor="v-fp" label="Forma de pago" required>
            <select
              id="v-fp"
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value as FormaPago)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              {(['efectivo', 'cuotas_2', 'cuotas_3'] as FormaPago[]).map((fp) => (
                <option key={fp} value={fp}>
                  {FORMA_PAGO_LABEL[fp]}
                </option>
              ))}
            </select>
          </Field>

          <Field htmlFor="v-reserva" label="Reserva (opcional)" hint="Cargar ítems de una reserva activa">
            <select
              id="v-reserva"
              value={idReserva}
              onChange={(e) => setIdReserva(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="">— Ninguna —</option>
              {reservasActivas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.cliente_nombre ?? 'Mostrador'} · {r.items_count} ítems
                  {' '}({new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')})
                </option>
              ))}
            </select>
          </Field>

          <Field htmlFor="v-cli" label="Cliente (opcional)">
            <select
              id="v-cli"
              value={idCliente}
              onChange={(e) => setIdCliente(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="">— Mostrador —</option>
              {clientesFiltrados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field htmlFor="v-obs" label="Observaciones">
            <Textarea
              id="v-obs"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
          El precio final se resuelve en el server aplicando la cascada
          de reglas (descuentos + recargo por forma de pago). Al confirmar,
          se verifica de nuevo estado del ítem y reserva.
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={() => setConfirmarOpen(true)}
          disabled={!puedeConfirmar}
        >
          {pending ? 'Registrando…' : `Confirmar venta · $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
        </Button>
      </aside>

      <ConfirmDialog
        open={confirmarOpen}
        title="Confirmar venta"
        description={`Se van a marcar ${lineas.length} ítem(s) como vendidos por un total de $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Esta acción no se puede deshacer sin anular la venta.`}
        confirmLabel="Sí, confirmar"
        cancelLabel="Cancelar"
        onConfirm={confirmar}
        onCancel={() => setConfirmarOpen(false)}
      />
    </div>
  )
}

function traducirReason(reason: string, extra?: Record<string, unknown>): string {
  if (reason.startsWith('item-not-found')) return 'No se encontró un ítem con ese QR en este tenant.'
  if (reason.startsWith('item-no-disponible')) {
    const est = extra?.estado ? ` (estado: ${extra.estado})` : ''
    return `El ítem no está disponible${est}.`
  }
  if (reason.startsWith('item-en-reserva')) return 'El ítem está reservado por otra reserva. Cargá esa reserva o cancelala primero.'
  if (reason.startsWith('item-en-otra-reserva')) return 'El ítem pertenece a otra reserva distinta a la que cargaste.'
  if (reason.startsWith('item-ya-reservado')) return 'El ítem ya está en una reserva activa.'
  if (reason === 'sin-precio-lista') return 'El producto no tiene precio de venta. Fijalo en Precios → Control de precios.'
  if (reason === 'reserva-no-activa') return 'La reserva ya no está activa (fue cancelada, vencida o convertida).'
  if (reason === 'lineas-vacias') return 'Agregá al menos un ítem al carrito.'
  return reason
}

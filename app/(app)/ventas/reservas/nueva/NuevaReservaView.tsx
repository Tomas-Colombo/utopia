'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import type { LineaCarrito } from '@/lib/types/ventas'
import { crearReservaAction } from '../../actions'

interface Cliente { id: string; nombre: string; telefono: string | null }

/**
 * Alta de reserva: carrito de items (sin precio final, porque el precio
 * se recalcula al vender) + cliente + fecha vencimiento.
 * Reutiliza el endpoint /api/ventas/lookup-item.
 */
export function NuevaReservaView({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [idCliente, setIdCliente] = useState('')
  const [fechaVenc, setFechaVenc] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3) // default: +3 días
    return d.toISOString().slice(0, 16)
  })
  const [observaciones, setObservaciones] = useState('')

  const [qrInput, setQrInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [items, setItems] = useState<LineaCarrito[]>([])

  async function agregar(e?: React.FormEvent) {
    e?.preventDefault()
    const qr = qrInput.trim()
    if (!qr) return
    if (items.some((l) => l.qr_code === qr)) {
      setErrorBusqueda('Ese ítem ya está en la lista')
      return
    }
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const r = await fetch(`/api/ventas/lookup-item?qr=${encodeURIComponent(qr)}`)
      const data = await r.json()
      if (!data.ok) {
        setErrorBusqueda(explicar(data.reason))
        return
      }
      setItems((xs) => [...xs, data.linea as LineaCarrito])
      setQrInput('')
    } catch (e) {
      setErrorBusqueda((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  function quitar(qr: string) {
    setItems((xs) => xs.filter((x) => x.qr_code !== qr))
  }

  function submit() {
    if (items.length === 0) return toast.error('Sin ítems', 'Agregá al menos uno')
    if (!fechaVenc) return toast.error('Falta vencimiento')
    start(async () => {
      const res = await crearReservaAction({
        idCliente: idCliente || null,
        items: items.map((i) => i.id_item),
        fechaVencimiento: new Date(fechaVenc).toISOString(),
        observaciones: observaciones || null,
      })
      if (!res.ok) return toast.error('No se pudo crear', explicar(res.reason))
      toast.success('Reserva creada')
      router.push(`/ventas/reservas/${res.data!.id}`)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <form onSubmit={agregar} className="rounded-lg border border-border bg-card p-4">
          <Field
            htmlFor="qr-r"
            label="Escanear o tipear QR"
            error={errorBusqueda ?? undefined}
          >
            <div className="flex gap-2">
              <Input
                id="qr-r"
                autoFocus
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Código QR del ítem"
                invalid={!!errorBusqueda}
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
                <th className="px-4 py-3 text-right">Precio referencia</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    Escaneá los ítems a reservar.
                  </td>
                </tr>
              ) : (
                items.map((l) => (
                  <tr key={l.qr_code} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.producto_nombre}</div>
                      <div className="text-xs text-muted">{l.sku ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{l.qr_code}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {l.precio_final != null
                        ? `$ ${l.precio_final.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => quitar(l.qr_code)}>
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
          El precio final se recalcula al momento de vender. Este listado es
          solo referencia para el cliente.
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <Field htmlFor="r-cli" label="Cliente (opcional)">
            <select
              id="r-cli"
              value={idCliente}
              onChange={(e) => setIdCliente(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="">— Mostrador —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.telefono ? ` · ${c.telefono}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="r-fv" label="Vence" required>
            <Input
              id="r-fv"
              type="datetime-local"
              value={fechaVenc}
              onChange={(e) => setFechaVenc(e.target.value)}
            />
          </Field>
          <Field htmlFor="r-obs" label="Observaciones">
            <Textarea
              id="r-obs"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </Field>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={submit}
          disabled={pending || items.length === 0}
        >
          {pending ? 'Creando…' : `Crear reserva (${items.length} ítems)`}
        </Button>
      </aside>
    </div>
  )
}

function explicar(reason: string): string {
  if (reason.startsWith('item-not-found')) return 'No se encontró un ítem con ese QR.'
  if (reason.startsWith('item-no-disponible')) return 'El ítem no está disponible.'
  if (reason.startsWith('item-ya-reservado') || reason.startsWith('item-en-reserva'))
    return 'El ítem ya está en otra reserva activa.'
  if (reason === 'vencimiento-invalido') return 'La fecha de vencimiento debe ser futura.'
  return reason
}

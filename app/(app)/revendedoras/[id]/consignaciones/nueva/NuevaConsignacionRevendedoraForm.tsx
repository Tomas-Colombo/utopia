'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { Table, type Column } from '@/components/ui/Table'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { crearConsignacionRevendedoraAction } from '../actions'

interface ItemSeleccionado {
  id_item: string
  id_producto: string
  nombre_producto: string
  codigo_barra: string | null
  sku: string
  talle: string | null
  precio_actual: number
}

export function NuevaConsignacionRevendedoraForm({
  idRevendedora,
  nombreRevendedora,
}: {
  idRevendedora: string
  nombreRevendedora: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [periodoDesde, setPeriodoDesde] = useState('')
  const [periodoHasta, setPeriodoHasta] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [motivo, setMotivo] = useState('')

  const [codigoInput, setCodigoInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorItem, setErrorItem] = useState<string | null>(null)
  const [items, setItems] = useState<ItemSeleccionado[]>([])

  async function handleBuscarItem(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const codigo = codigoInput.trim()
    if (!codigo) {
      setErrorItem('Escaneá o escribí un código.')
      return
    }

    if (items.some((i) => i.codigo_barra === codigo || i.sku === codigo)) {
      setErrorItem('Ese ítem ya está agregado al lote.')
      return
    }

    setBuscando(true)
    setErrorItem(null)

    try {
      const res = await fetch(
        `/api/revendedoras/lookup-item?qr=${encodeURIComponent(codigo)}&id_revendedora=${encodeURIComponent(
          idRevendedora
        )}`
      )
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setErrorItem(mensajeDeError(data.reason || 'item-not-found'))
        return
      }

      setItems((prev) => [...prev, data.item])
      setCodigoInput('')
    } catch {
      setErrorItem('Error de conexión al buscar el ítem.')
    } finally {
      setBuscando(false)
    }
  }

  function handleQuitarItem(idItem: string) {
    setItems((prev) => prev.filter((i) => i.id_item !== idItem))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) {
      toast.error('Agregá al menos un ítem al lote de consignación.')
      return
    }

    startTransition(async () => {
      const res = await crearConsignacionRevendedoraAction({
        id_revendedora: idRevendedora,
        items: items.map((i) => i.id_item),
        periodo_desde: periodoDesde || null,
        periodo_hasta: periodoHasta || null,
        observaciones: observaciones || null,
        motivo: motivo || null,
      })

      if (!res.ok) {
        toast.error(mensajeDeError(res.reason))
        return
      }

      toast.success('Borrador de consignación creado exitosamente.')
      router.push(`/revendedoras/${idRevendedora}/consignaciones/${res.id_consignacion_revendedora}`)
    })
  }

  const columns: Column<ItemSeleccionado>[] = [
    {
      key: 'sku',
      label: 'Código / SKU',
      render: (r) => (
        <div>
          <div className="font-mono text-sm">{r.sku}</div>
          {r.codigo_barra && <div className="font-mono text-xs text-muted">{r.codigo_barra}</div>}
        </div>
      ),
    },
    {
      key: 'nombre',
      label: 'Producto',
      render: (r) => <span className="font-medium text-sm">{r.nombre_producto}</span>,
    },
    {
      key: 'talle',
      label: 'Talle',
      render: (r) => <span className="text-sm">{r.talle || '—'}</span>,
    },
    {
      key: 'precio',
      label: 'Precio venta',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-sm">
          $ {r.precio_actual.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="bare"
          type="button"
          onClick={() => handleQuitarItem(r.id_item)}
          className="text-warn-ink hover:underline text-sm font-medium"
        >
          Quitar
        </Button>
      ),
    },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-border pb-4">
        <h2 className="font-display text-xl">Nueva consignación de salida</h2>
        <p className="text-sm text-muted">Revendedora: {nombreRevendedora}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field htmlFor="periodo-desde" label="Período desde (opcional)">
          <Input
            id="periodo-desde"
            type="date"
            value={periodoDesde}
            onChange={(e) => setPeriodoDesde(e.target.value)}
          />
        </Field>
        <Field htmlFor="periodo-hasta" label="Período hasta (opcional)">
          <Input
            id="periodo-hasta"
            type="date"
            value={periodoHasta}
            onChange={(e) => setPeriodoHasta(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field htmlFor="observaciones" label="Observaciones (opcional)">
          <Textarea
            id="observaciones"
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas sobre el acuerdo o entrega..."
          />
        </Field>
        <Field htmlFor="motivo" label="Motivo inicial (opcional)">
          <Input
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Muestrario temporada primavera"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-card-2 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Field htmlFor="codigo-input" label="Escanear o ingresar código / SKU">
              <Input
                id="codigo-input"
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleBuscarItem()
                  }
                }}
                placeholder="Código de barras o SKU del ítem disponible..."
                disabled={buscando}
              />
            </Field>
          </div>
          <Button
            type="button"
            onClick={() => handleBuscarItem()}
            disabled={buscando || !codigoInput.trim()}
          >
            {buscando ? 'Buscando...' : 'Agregar ítem'}
          </Button>
        </div>

        {errorItem && <div className="text-sm text-warn-ink font-medium">{errorItem}</div>}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Ítems a consignar ({items.length})</h3>
            {items.length > 0 && (
              <span className="text-xs text-muted">
                Total estimado: ${' '}
                {items
                  .reduce((acc, curr) => acc + curr.precio_actual, 0)
                  .toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted rounded border border-dashed border-border bg-card">
              No hay ítems agregados aún. Escaneá o ingresá códigos arriba.
            </div>
          ) : (
            <div className="rounded border border-border bg-card">
              <Table data={items} columns={columns} getRowId={(r) => r.id_item} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(`/revendedoras/${idRevendedora}/consignaciones`)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || items.length === 0}>
          {pending ? 'Guardando...' : 'Guardar borrador'}
        </Button>
      </div>
    </form>
  )
}

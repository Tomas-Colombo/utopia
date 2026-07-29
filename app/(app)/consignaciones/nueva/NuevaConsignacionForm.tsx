'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { crearConsignacionAction } from '../actions'

interface Prov { id: string; nombre: string; tipo: string }

/**
 * Paso 1: elegir proveedor + notas. Al crear se abre la pantalla del lote
 * donde se cargan los items uno a uno vía QR (§L82 "aparté para devolver").
 */
export function NuevaConsignacionForm({
  proveedores,
  soloConsignatarios,
}: {
  proveedores: Prov[]
  soloConsignatarios: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [idProv, setIdProv] = useState(proveedores[0]?.id ?? '')
  const [obs, setObs] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!idProv) return toast.error('Elegí un proveedor')
    start(async () => {
      const res = await crearConsignacionAction({
        idProveedor: idProv,
        observaciones: obs || null,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      toast.success('Consignación creada')
      router.push(`/consignaciones/${res.data!.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        htmlFor="c-prov"
        label="Proveedor"
        required
        hint={
          soloConsignatarios
            ? 'Solo se listan proveedores con tipo "consignatario".'
            : 'Ningún proveedor está marcado como "consignatario" — se listan todos, pero solo items con tipo_ingreso=consignacion podrán apartarse.'
        }
      >
        <select
          id="c-prov"
          value={idProv}
          onChange={(e) => setIdProv(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
        >
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} · {p.tipo}
            </option>
          ))}
        </select>
      </Field>

      <Field htmlFor="c-obs" label="Observaciones">
        <Textarea
          id="c-obs"
          rows={3}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Motivo general del lote (rotación baja, temporada anterior, defectos, etc.)"
        />
      </Field>

      <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
        Al crear se abre el lote en estado <b>activa</b>. Vas a apartar
        los ítems escaneando el QR. Cuando el proveedor viene a buscar
        la mercadería, confirmás la salida ítem por ítem (o el lote entero).
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear consignación'}
        </Button>
      </div>
    </form>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { PdfUploadStub } from '@/components/inventario/PdfUploadStub'
import type { ProveedorRow, TipoIngreso } from '@/lib/types/inventario'
import { createIngresoAction } from '../../actions'

const TIPOS: { value: TipoIngreso; label: string }[] = [
  { value: 'compra', label: 'Compra (paga al ingresar)' },
  { value: 'consignacion', label: 'Consignación (paga al vender)' },
]

export function NuevoIngresoForm({ proveedores }: { proveedores: ProveedorRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [idProveedor, setIdProveedor] = useState(proveedores[0]?.id_proveedor ?? '')
  const [tipoIngreso, setTipoIngreso] = useState<TipoIngreso>('compra')
  const [numeroRemito, setNumeroRemito] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!idProveedor) {
      toast.error('Falta proveedor')
      return
    }
    start(async () => {
      const res = await createIngresoAction({
        idProveedor,
        tipoIngreso,
        numeroRemito: numeroRemito || null,
        observaciones: observaciones || null,
        pdfUrl,
      })
      if (!res.ok) return toast.error('No se pudo crear', res.reason)
      toast.success('Ingreso creado como borrador')
      router.push(`/inventario/ingresos/${res.data!.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field htmlFor="i-prov" label="Proveedor" required>
        <select
          id="i-prov"
          value={idProveedor}
          onChange={(e) => setIdProveedor(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
        >
          {proveedores.map((p) => (
            <option key={p.id_proveedor} value={p.id_proveedor}>
              {p.nombre} · {p.tipo}
            </option>
          ))}
        </select>
      </Field>

      <Field htmlFor="i-tipo" label="Tipo de ingreso" required>
        <select
          id="i-tipo"
          value={tipoIngreso}
          onChange={(e) => setTipoIngreso(e.target.value as TipoIngreso)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field htmlFor="i-remito" label="Número de remito/factura">
        <Input
          id="i-remito"
          value={numeroRemito}
          onChange={(e) => setNumeroRemito(e.target.value)}
        />
      </Field>

      <Field htmlFor="i-obs" label="Observaciones">
        <Textarea
          id="i-obs"
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
      </Field>

      <PdfUploadStub onChange={setPdfUrl} />

      <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
        Al crear se abre como <b>borrador</b>. Vas a agregar las líneas
        (producto + cantidad + costo) y luego confirmar para generar los
        ítems físicos con QR único.
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Crear borrador'}
        </Button>
      </div>
    </form>
  )
}

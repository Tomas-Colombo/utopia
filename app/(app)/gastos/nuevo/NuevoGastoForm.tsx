'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { registrarGastoAction } from '../../rendiciones/actions'

interface Cat { id: string; nombre: string }

export function NuevoGastoForm({ categorias }: { categorias: Cat[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [idCat, setIdCat] = useState(categorias[0]?.id ?? '')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [comprobante, setComprobante] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const m = Number(monto || 0)
    if (m <= 0) return setErr('Monto inválido')
    if (descripcion.trim().length < 2) return setErr('Descripción muy corta')
    if (!idCat) return setErr('Elegí una categoría')
    setErr(null)
    start(async () => {
      const res = await registrarGastoAction({
        idCategoriaGasto: idCat,
        monto: m,
        descripcion,
        fecha: fecha ? new Date(fecha).toISOString() : null,
        comprobanteRef: comprobante || null,
      })
      if (!res.ok) return toast.error('No se pudo registrar', res.reason)
      toast.success('Gasto registrado')
      router.push('/gastos')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field htmlFor="g-cat" label="Categoría" required>
        <select
          id="g-cat"
          value={idCat}
          onChange={(e) => setIdCat(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field htmlFor="g-monto" label="Monto" required>
          <NumberInput
            id="g-monto"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
          />
        </Field>
        <Field htmlFor="g-fecha" label="Fecha">
          <Input
            id="g-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>
      </div>

      <Field htmlFor="g-desc" label="Descripción" required>
        <Textarea
          id="g-desc"
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </Field>

      <Field htmlFor="g-comp" label="Referencia de comprobante" hint="Número de factura/recibo (opcional)">
        <Input id="g-comp" value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
      </Field>

      {err && (
        <div role="alert" className="rounded-md border border-pink-strong bg-pink-bg px-3 py-2 text-sm text-pink-strong">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Registrar gasto'}
        </Button>
      </div>
    </form>
  )
}

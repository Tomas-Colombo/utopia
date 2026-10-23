'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NumberInput } from '@/components/ui/NumberInput'
import { useToast } from '@/components/ui/Toast'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { QR_LADO_MM_MAX, QR_LADO_MM_MIN } from '@/lib/inventario/limites'
import { updateConfiguracionQrAction } from './actions'

export function ConfiguracionQrCard({
  ladoMmInicial,
  canEdit,
}: {
  ladoMmInicial: number
  canEdit: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [ladoMm, setLadoMm] = useState(String(ladoMmInicial))

  const valorNum = Number(ladoMm)
  const valido =
    Number.isInteger(valorNum) && valorNum >= QR_LADO_MM_MIN && valorNum <= QR_LADO_MM_MAX
  const sinCambios = valido && valorNum === ladoMmInicial

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    if (!valido) {
      return toast.error(
        'Medida inválida',
        mensajeDeError('qr-lado-mm-invalido'),
      )
    }

    start(async () => {
      const res = await updateConfiguracionQrAction({ ladoMm: valorNum })
      if (!res.ok) {
        return toast.error('No se pudo guardar', mensajeDeError(res.reason))
      }
      toast.success('Configuración guardada', `Las etiquetas se imprimirán con QR de ${valorNum} × ${valorNum} mm.`)
      router.refresh()
    })
  }

  return (
    <Card as="section" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">Etiquetas QR de inventario</h3>
          <p className="mt-0.5 text-sm text-muted">
            Definí la medida física del lado del código QR (en milímetros) al imprimir etiquetas.
            Como el QR es cuadrado, una sola medida aplica al ancho y al alto.
          </p>
        </div>
        <span className="rounded-md border border-border bg-card-2 px-2.5 py-1 font-mono text-xs text-muted">
          Actual: {ladoMmInicial} × {ladoMmInicial} mm
        </span>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field
            htmlFor="cfg-qr-lado-mm"
            label={`Lado del QR (${QR_LADO_MM_MIN} a ${QR_LADO_MM_MAX} mm)`}
          >
            <NumberInput
              id="cfg-qr-lado-mm"
              min={QR_LADO_MM_MIN}
              max={QR_LADO_MM_MAX}
              step={1}
              value={ladoMm}
              onChange={(e) => setLadoMm(e.target.value)}
              disabled={!canEdit || pending}
            />
          </Field>
        </div>
        {canEdit && (
          <Button type="submit" size="sm" disabled={pending || !valido || sinCambios}>
            {pending ? 'Guardando…' : 'Guardar tamaño'}
          </Button>
        )}
      </form>
    </Card>
  )
}

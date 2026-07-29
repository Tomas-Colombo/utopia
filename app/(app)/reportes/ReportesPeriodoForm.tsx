'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'

/**
 * Selector de período. Cambia URL params → server re-renderea con los
 * nuevos totales. Presets rápidos: hoy, mes, año.
 */
export function ReportesPeriodoForm({
  desde,
  hasta,
}: {
  desde: string
  hasta: string
}) {
  const router = useRouter()
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)

  function apply(desdeStr: string, hastaStr: string) {
    const params = new URLSearchParams()
    params.set('desde', desdeStr)
    params.set('hasta', hastaStr)
    router.push(`/reportes?${params.toString()}`)
  }

  function preset(kind: 'hoy' | 'mes' | 'anio') {
    const now = new Date()
    let desdeStr: string
    let hastaStr: string
    if (kind === 'hoy') {
      const s = now.toISOString().slice(0, 10)
      desdeStr = s
      hastaStr = s
    } else if (kind === 'mes') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      desdeStr = first.toISOString().slice(0, 10)
      hastaStr = last.toISOString().slice(0, 10)
    } else {
      desdeStr = `${now.getFullYear()}-01-01`
      hastaStr = `${now.getFullYear()}-12-31`
    }
    setD(desdeStr)
    setH(hastaStr)
    apply(desdeStr, hastaStr)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        apply(d, h)
      }}
      className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
    >
      <div className="w-40">
        <Field htmlFor="rp-d" label="Desde">
          <Input id="rp-d" type="date" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
      </div>
      <div className="w-40">
        <Field htmlFor="rp-h" label="Hasta">
          <Input id="rp-h" type="date" value={h} onChange={(e) => setH(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2 ml-auto">
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('hoy')}>Hoy</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('mes')}>Este mes</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('anio')}>Este año</Button>
        <Button type="submit">Aplicar</Button>
      </div>
    </form>
  )
}
